#!/usr/bin/env node
/**
 * D0T TIMEOUT SENSOR
 * ══════════════════════════════════════════════════════════════
 * 
 * Detects when Claude stops responding and clicks Continue.
 * NOT an always-clicking bot. A timeout detector.
 * 
 * HOW IT WORKS:
 *   1. Takes periodic screenshots
 *   2. Compares them - if screen hasn't changed, Claude stopped
 *   3. ONLY THEN looks for Continue button
 *   4. Clicks it and goes back to watching
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Tesseract = require('tesseract.js');

// ══════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════

const CONFIG = {
  // How often to check if screen changed
  checkInterval: 3000,
  
  // How many consecutive unchanged checks = timeout detected
  unchangedThreshold: 3,  // 3 checks * 3 seconds = 9 seconds of no change
  
  // After clicking, wait this long before resuming detection
  cooldownAfterClick: 5000,
  
  // All buttons that indicate Claude stopped/needs permission
  targetButtons: ['Continue', 'Keep', 'Allow', 'Yes', 'OK', 'Proceed', 'Run'],
  
  // Minimum confidence to trust OCR
  minConfidence: 85,
};

// ══════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════

let state = {
  running: false,
  worker: null,
  lastScreenHash: null,
  unchangedCount: 0,
  mode: 'watching',  // 'watching' | 'timeout_detected' | 'cooldown'
};

// ══════════════════════════════════════════════════════════════
// LOGGING
// ══════════════════════════════════════════════════════════════

function log(type, msg) {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const icons = {
    'watch': '👁️',
    'same': '⏸️',
    'changed': '▶️',
    'timeout': '⏰',
    'scan': '🔍',
    'click': '🖱️',
    'cooldown': '💤',
    'info': 'ℹ️',
    'error': '❌',
  };
  console.log(`${icons[type] || '•'} [${time}] ${msg}`);
}

// ══════════════════════════════════════════════════════════════
// SCREEN COMPARISON
// ══════════════════════════════════════════════════════════════

function screenshot() {
  try {
    execSync(`powershell -ExecutionPolicy Bypass -File "${path.join(__dirname, 'screenshot.ps1')}"`, {
      timeout: 5000,
      cwd: __dirname,
    });
    return path.join(__dirname, 'screenshot.png');
  } catch (err) {
    log('error', 'Screenshot failed');
    return null;
  }
}

function hashImage(imagePath) {
  try {
    const data = fs.readFileSync(imagePath);
    return crypto.createHash('md5').update(data).digest('hex');
  } catch (err) {
    return null;
  }
}

function hasScreenChanged(imagePath) {
  const currentHash = hashImage(imagePath);
  if (!currentHash) return true;  // Assume changed on error
  
  const changed = state.lastScreenHash !== currentHash;
  state.lastScreenHash = currentHash;
  return changed;
}

// ══════════════════════════════════════════════════════════════
// OCR & CLICK (only used when timeout detected)
// ══════════════════════════════════════════════════════════════

async function initWorker() {
  if (!state.worker) {
    log('info', 'Initializing OCR...');
    state.worker = await Tesseract.createWorker('eng');
  }
  return state.worker;
}

async function findTimeoutButton(imagePath) {
  try {
    const worker = await initWorker();
    const result = await worker.recognize(imagePath, {}, { blocks: true });
    
    const candidates = [];
    if (result.data.blocks) {
      result.data.blocks.forEach(block => {
        block.paragraphs?.forEach(para => {
          para.lines?.forEach(line => {
            line.words?.forEach(word => {
              if (word.bbox && word.text) {
                const cleanText = word.text.replace(/[",.']/g, '').toLowerCase();
                const match = CONFIG.targetButtons.find(b => b.toLowerCase() === cleanText);
                
                if (match && word.confidence > CONFIG.minConfidence) {
                  candidates.push({
                    text: match,
                    x: Math.round((word.bbox.x0 + word.bbox.x1) / 2),
                    y: Math.round((word.bbox.y0 + word.bbox.y1) / 2),
                    confidence: word.confidence,
                  });
                }
              }
            });
          });
        });
      });
    }
    
    if (candidates.length === 0) return null;
    
    // Priority: Continue > Keep > Allow > Yes > OK > Proceed > Run
    // Return highest priority button with best confidence
    candidates.sort((a, b) => {
      const aPri = CONFIG.targetButtons.indexOf(a.text);
      const bPri = CONFIG.targetButtons.indexOf(b.text);
      if (aPri !== bPri) return aPri - bPri;
      return b.confidence - a.confidence;
    });
    
    const best = candidates[0];
    log('scan', `Found: ${candidates.map(c => `${c.text}@(${c.x},${c.y})`).join(', ')}`);
    return { x: best.x, y: best.y, text: best.text };
  } catch (err) {
    log('error', `OCR failed: ${err.message}`);
    return null;
  }
}

function click(x, y, buttonName) {
  try {
    execSync(`powershell -ExecutionPolicy Bypass -File "${path.join(__dirname, 'click.ps1')}" ${x} ${y}`, {
      timeout: 2000,
    });
    log('click', `Clicked "${buttonName}" at (${x}, ${y})`);
    return true;
  } catch (err) {
    log('error', 'Click failed');
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN LOOP
// ══════════════════════════════════════════════════════════════

async function sensorLoop() {
  if (!state.running) return;
  
  // COOLDOWN MODE - just wait
  if (state.mode === 'cooldown') {
    setTimeout(sensorLoop, CONFIG.checkInterval);
    return;
  }
  
  // Take screenshot
  const imgPath = screenshot();
  if (!imgPath) {
    setTimeout(sensorLoop, CONFIG.checkInterval);
    return;
  }
  
  // WATCHING MODE - detect timeout
  if (state.mode === 'watching') {
    const changed = hasScreenChanged(imgPath);
    
    if (changed) {
      state.unchangedCount = 0;
      log('changed', 'Screen changed - Claude is active');
    } else {
      state.unchangedCount++;
      log('same', `Screen unchanged (${state.unchangedCount}/${CONFIG.unchangedThreshold})`);
      
      if (state.unchangedCount >= CONFIG.unchangedThreshold) {
        log('timeout', 'TIMEOUT DETECTED - Looking for Continue button...');
        state.mode = 'timeout_detected';
      }
    }
  }
  
  // TIMEOUT DETECTED - find and click Continue
  if (state.mode === 'timeout_detected') {
    log('scan', 'Scanning for timeout button...');
    const button = await findTimeoutButton(imgPath);
    
    if (button) {
      click(button.x, button.y, button.text);
      
      // Enter cooldown
      state.mode = 'cooldown';
      state.unchangedCount = 0;
      state.lastScreenHash = null;  // Reset so we detect new changes
      log('cooldown', `Cooling down for ${CONFIG.cooldownAfterClick/1000}s...`);
      
      setTimeout(() => {
        state.mode = 'watching';
        log('watch', 'Resuming timeout detection');
      }, CONFIG.cooldownAfterClick);
    } else {
      log('scan', 'No Continue button found - still looking...');
      // Stay in timeout_detected mode, keep looking
    }
  }
  
  setTimeout(sensorLoop, CONFIG.checkInterval);
}

// ══════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════

async function start() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                  D0T TIMEOUT SENSOR                           ║
║  ⏰ Detects when Claude stops responding                      ║
║  🎯 Clicks Continue only when timeout detected                ║
║  💤 Sleeps while Claude is active                             ║
║  Press Ctrl+C to stop                                         ║
╚═══════════════════════════════════════════════════════════════╝
`);
  
  state.running = true;
  state.mode = 'watching';
  log('watch', 'Started - watching for timeouts...');
  await sensorLoop();
}

process.on('SIGINT', () => {
  state.running = false;
  if (state.worker) state.worker.terminate();
  log('info', 'Stopped');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  log('error', `Uncaught exception: ${err.message}`);
});

process.on('unhandledRejection', (reason) => {
  log('error', `Unhandled rejection: ${String(reason)}`);
});

start();
