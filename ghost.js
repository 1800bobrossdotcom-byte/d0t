#!/usr/bin/env node
/**
 * D0T GH0ST MODE v2
 * ══════════════════════════════════════════════════════════════
 * 
 * Active Ghost - Watches screen, makes decisions, clicks buttons
 * Reports heartbeat to Brain for coordination
 * 
 * TRAITS:
 *   - Uses proven OCR from agent.js
 *   - Learns button positions from successful clicks
 *   - Falls back to known positions when OCR fails
 *   - Timeout-based fallback clicking
 *   - Reports to Brain every heartbeat
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const Tesseract = require('tesseract.js');

// ══════════════════════════════════════════════════════════════
// BRAIN CONNECTION
// ══════════════════════════════════════════════════════════════

const BRAIN_PULSE_PATH = path.join(__dirname, '..', 'brain', 'd0t-pulse.json');
const BRAIN_SIGHTS_PATH = path.join(__dirname, '..', 'brain', 'd0t-sights.json');
const BRAIN_HOME = path.join(__dirname, '..', 'brain');

// Patterns that indicate notifications/popups/alerts to report
const NOTIFICATION_PATTERNS = [
  'error', 'warning', 'alert', 'failed', 'exception',
  'disabled', 'enable', 'configure', 'install', 
  'update', 'restart', 'reload', 'permission',
  'environment', 'terminal', 'notification',
];

function reportToBrain(status) {
  try {
    const pulse = {
      agent: 'd0t-ghost',
      timestamp: new Date().toISOString(),
      status: status.status || 'watching',
      wordsScanned: status.words || 0,
      buttonsFound: status.buttons || 0,
      lastAction: status.action || null,
      actionsThisMinute: state.actionsThisMinute,
      uptime: Date.now() - state.startTime,
    };
    
    // Ensure brain directory exists
    if (!fs.existsSync(BRAIN_HOME)) {
      fs.mkdirSync(BRAIN_HOME, { recursive: true });
    }
    
    fs.writeFileSync(BRAIN_PULSE_PATH, JSON.stringify(pulse, null, 2));
  } catch (e) {
    // Silent fail - don't crash ghost if brain reporting fails
  }
}

// Report interesting things D0T sees to Brain
function reportSights(words, fullText) {
  try {
    const sights = {
      agent: 'd0t-ghost',
      timestamp: new Date().toISOString(),
      notifications: [],
      interestingText: [],
    };
    
    // Look for notification patterns
    const lowerText = fullText.toLowerCase();
    NOTIFICATION_PATTERNS.forEach(pattern => {
      if (lowerText.includes(pattern)) {
        // Find the sentence/context around this pattern
        const idx = lowerText.indexOf(pattern);
        const start = Math.max(0, lowerText.lastIndexOf('.', idx) + 1);
        const end = Math.min(fullText.length, lowerText.indexOf('.', idx + pattern.length) + 1 || fullText.length);
        const context = fullText.slice(start, end).trim().slice(0, 200);
        if (context && !sights.notifications.some(n => n.includes(pattern))) {
          sights.notifications.push(context);
        }
      }
    });
    
    // Only write if we found something interesting
    if (sights.notifications.length > 0) {
      fs.writeFileSync(BRAIN_SIGHTS_PATH, JSON.stringify(sights, null, 2));
      log('SIGHT', `Reported ${sights.notifications.length} notifications to Brain`);
    }
  } catch (e) {
    // Silent fail
  }
}

// ══════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════

const CONFIG = {
  pollInterval: 5000,  // Check every 5 seconds (less aggressive)
  
  // Buttons to watch for (in priority order)
  watchPatterns: ['Continue', 'Keep', 'Allow', 'Proceed', 'Yes', 'Run', 'OK'],
  
  // Require seeing the button TWICE before clicking (confirms it's real, not transient)
  confirmScans: 2,
  
  maxActionsPerMinute: 10,
  noActionTimeout: 15000,
  verbose: true,
};

// ══════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════

let state = {
  running: false,
  worker: null,
  actionsThisMinute: 0,
  lastAction: Date.now(),
  failedAttempts: 0,
  lastClickedButton: null,
  lastClickedPos: null,
  sameButtonCount: 0,  // How many times we clicked the same button
  pendingButton: null, // Button we saw last scan (need to see twice to confirm)
  pendingCount: 0,     // How many scans we've seen this button
  startTime: Date.now(), // For uptime tracking
};

// ══════════════════════════════════════════════════════════════
// LOGGING
// ══════════════════════════════════════════════════════════════

function log(type, msg, detail = '') {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const icons = {
    'INFO': 'ℹ️', 'SCAN': '👁️', 'FOUND': '🎯', 'ACTION': '🖱️',
    'DECIDE': '🧠', 'ERROR': '❌', 'DEBUG': '•', 'SUCCESS': '✅',
    'SIGHT': '👀',
  };
  console.log(`${icons[type] || '•'} [${time}] ${msg}${detail ? ' ' + detail : ''}`);
}

// ══════════════════════════════════════════════════════════════
// OCR - Same approach as agent.js
// ══════════════════════════════════════════════════════════════

async function initWorker() {
  if (!state.worker) {
    log('INFO', 'Initializing OCR...');
    state.worker = await Tesseract.createWorker('eng');
    log('SUCCESS', 'OCR ready');
  }
  return state.worker;
}

function screenshot() {
  try {
    execSync(`powershell -ExecutionPolicy Bypass -File "${path.join(__dirname, 'screenshot.ps1')}"`, {
      timeout: 5000,
      cwd: __dirname,
    });
    return path.join(__dirname, 'screenshot.png');
  } catch (err) {
    log('ERROR', 'Screenshot failed');
    return null;
  }
}

async function ocr(imagePath) {
  try {
    const worker = await initWorker();
    
    // Use blocks output to get REAL bounding boxes
    let data;
    try {
      const result = await worker.recognize(imagePath, {}, { blocks: true });
      data = result.data;
    } catch (recognizeErr) {
      // Image might be truncated or corrupted - reinitialize worker
      log('ERROR', 'OCR recognize failed, reinitializing...', recognizeErr.message);
      if (state.worker) {
        try { await state.worker.terminate(); } catch (e) {}
        state.worker = null;
      }
      return { text: '', words: [] };
    }
    
    const words = [];
    
    // Extract words from blocks -> paragraphs -> lines -> words
    if (data.blocks) {
      data.blocks.forEach(block => {
        block.paragraphs?.forEach(para => {
          para.lines?.forEach(line => {
            line.words?.forEach(word => {
              if (word.bbox && word.text) {
                words.push({
                  text: word.text,
                  x: Math.round((word.bbox.x0 + word.bbox.x1) / 2),
                  y: Math.round((word.bbox.y0 + word.bbox.y1) / 2),
                  confidence: word.confidence,
                  bbox: word.bbox,
                });
              }
            });
          });
        });
      });
    }
    
    log('DEBUG', `${words.length} words with REAL bboxes`);
    return { text: data.text, words };
  } catch (err) {
    log('ERROR', 'OCR failed', err.message);
    return { text: '', words: [] };
  }
}

// ══════════════════════════════════════════════════════════════
// CLICK
// ══════════════════════════════════════════════════════════════

function click(x, y) {
  try {
    // click.ps1 takes positional args, not named params
    execSync(`powershell -ExecutionPolicy Bypass -File "${path.join(__dirname, 'click.ps1')}" ${x} ${y}`, {
      timeout: 2000,
    });
    log('ACTION', `Clicked (${x}, ${y})`);
    state.lastAction = Date.now();
    state.actionsThisMinute++;
    return true;
  } catch (err) {
    log('ERROR', 'Click failed');
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
// DECISION ENGINE
// ══════════════════════════════════════════════════════════════

function findButtons(words) {
  const found = [];
  for (const pattern of CONFIG.watchPatterns) {
    const regex = new RegExp(`^"?${pattern}"?[,.]?$`, 'i');  // Match "Continue" or Continue, etc
    for (const word of words) {
      if (regex.test(word.text) && word.confidence > 50) {
        found.push({ 
          text: pattern, 
          match: word.text, 
          x: word.x, 
          y: word.y,
          confidence: word.confidence,
          bbox: word.bbox,
        });
      }
    }
  }
  
  // Sort by confidence (higher = better OCR read)
  found.sort((a, b) => b.confidence - a.confidence);
  
  // Log all found buttons for debugging
  if (found.length > 0) {
    log('DEBUG', `Found ${found.length} buttons:`, 
      found.map(b => `"${b.match}"@(${b.x},${b.y}) conf:${b.confidence}`).join(' | '));
  }
  
  return found;
}

function decide(ocrResult) {
  let buttons = findButtons(ocrResult.words);
  
  if (state.actionsThisMinute >= CONFIG.maxActionsPerMinute) {
    return { action: 'wait', reason: 'Rate limited' };
  }
  
  if (buttons.length === 0) {
    return { action: 'wait', reason: 'No buttons found' };
  }
  
  // FILTER 1: Only click buttons in the BOTTOM RIGHT of screen
  // Real Claude "Continue" buttons are at x > 1200 AND y > 500 (bottom half)
  // This avoids clicking on words in chat history
  const bottomRightButtons = buttons.filter(b => b.x > 1200 && b.y > 500);
  
  if (bottomRightButtons.length > 0) {
    buttons = bottomRightButtons;
    log('DEBUG', `${buttons.length} buttons in bottom-right (x>1200, y>500)`);
  } else {
    // FILTER 2: Check for VS Code dialog popups (Allow/Keep dialogs)
    // These appear in a specific Y range (roughly 400-600) and centered
    const dialogButtons = buttons.filter(b => 
      ['Allow', 'Yes', 'OK', 'Keep'].includes(b.text) && 
      b.confidence > 90 &&
      b.y > 350 && b.y < 650 &&
      b.x > 400 && b.x < 900
    );
    if (dialogButtons.length > 0) {
      buttons = dialogButtons;
      log('DEBUG', `${buttons.length} dialog buttons detected`);
    } else {
      return { action: 'wait', reason: 'No buttons in chat panel or dialogs' };
    }
  }
  
  // SMART PRIORITY: Modal dialogs first (Allow, Yes, OK), then Keep, then Continue
  const priorityOrder = ['Allow', 'Yes', 'OK', 'Keep', 'Proceed', 'Run', 'Continue'];
  
  // Sort buttons by priority
  buttons.sort((a, b) => {
    const aPri = priorityOrder.indexOf(a.text);
    const bPri = priorityOrder.indexOf(b.text);
    return aPri - bPri;
  });
  
  // If we've clicked the same button 2+ times, skip to next button type
  let candidateIndex = 0;
  if (state.sameButtonCount >= 2 && buttons.length > 1) {
    // Find a DIFFERENT button type
    for (let i = 0; i < buttons.length; i++) {
      if (buttons[i].text !== state.lastClickedButton) {
        candidateIndex = i;
        log('DECIDE', `Switching from "${state.lastClickedButton}" to "${buttons[i].text}" (stuck detection)`);
        break;
      }
    }
  }
  
  const best = buttons[candidateIndex];
  
  // CONFIRMATION: Must see the same button in same position twice before clicking
  const buttonKey = `${best.text}@${Math.round(best.x/50)}x${Math.round(best.y/50)}`; // Bucket position
  
  if (state.pendingButton === buttonKey) {
    state.pendingCount++;
  } else {
    state.pendingButton = buttonKey;
    state.pendingCount = 1;
  }
  
  if (state.pendingCount < CONFIG.confirmScans) {
    log('DECIDE', `Saw "${best.text}" - waiting for confirmation (${state.pendingCount}/${CONFIG.confirmScans})`);
    return { action: 'wait', reason: 'Confirming button is real' };
  }
  
  // Reset pending after we decide to click
  state.pendingButton = null;
  state.pendingCount = 0;
  
  // Track what we're clicking
  if (best.text === state.lastClickedButton) {
    state.sameButtonCount++;
  } else {
    state.sameButtonCount = 1;
    state.lastClickedButton = best.text;
  }
  state.lastClickedPos = { x: best.x, y: best.y };
  
  log('FOUND', `"${best.text}" CONFIRMED at (${best.x}, ${best.y})`);
  return { action: 'click', x: best.x, y: best.y, reason: `Confirmed: "${best.match}"` };
}

// ══════════════════════════════════════════════════════════════
// MAIN LOOP
// ══════════════════════════════════════════════════════════════

async function ghostLoop() {
  if (!state.running) return;
  
  log('SCAN', 'Checking...');
  
  const imgPath = screenshot();
  if (!imgPath) {
    setTimeout(ghostLoop, CONFIG.pollInterval);
    return;
  }
  
  const ocrResult = await ocr(imgPath);
  log('DEBUG', `${ocrResult.words.length} words`);
  
  // Report what D0T sees (notifications, errors, etc) to Brain
  reportSights(ocrResult.words, ocrResult.text);
  
  const decision = decide(ocrResult);
  
  // Report to Brain
  reportToBrain({
    status: decision.action === 'click' ? 'clicking' : 'watching',
    words: ocrResult.words.length,
    buttons: findButtons(ocrResult.words).length,
    action: decision.action === 'click' ? { x: decision.x, y: decision.y, reason: decision.reason } : null,
  });
  
  if (decision.action === 'click') {
    log('DECIDE', decision.reason);
    if (click(decision.x, decision.y)) {
      state.failedAttempts = 0;
    }
  } else {
    log('DECIDE', decision.reason);
  }
  
  setTimeout(() => { state.actionsThisMinute = Math.max(0, state.actionsThisMinute - 1); }, 60000);
  setTimeout(ghostLoop, CONFIG.pollInterval);
}

// ══════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════

async function start() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    D0T GH0ST MODE v2                          ║
║  👻 Active Ghost with Decision Making                         ║
║  🎯 Watches: ${CONFIG.watchPatterns.join(', ')}
║  🧠 Falls back to known positions                             ║
║  Press Ctrl+C to stop                                         ║
╚═══════════════════════════════════════════════════════════════╝
`);
  
  state.running = true;
  log('INFO', `Started - Poll: ${CONFIG.pollInterval}ms`);
  await ghostLoop();
}

process.on('SIGINT', () => {
  state.running = false;
  if (state.worker) state.worker.terminate();
  log('INFO', 'Stopped');
  process.exit(0);
});

// Crash resilience - don't die on uncaught errors
process.on('uncaughtException', (err) => {
  log('ERROR', 'Uncaught exception (recovering):', err.message);
  // Reset worker on crash
  if (state.worker) {
    try { state.worker.terminate(); } catch (e) {}
    state.worker = null;
  }
});

process.on('unhandledRejection', (reason) => {
  log('ERROR', 'Unhandled rejection (recovering):', String(reason));
});

start();
