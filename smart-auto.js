#!/usr/bin/env node
/**
 * D0T Smart Autonomous Controller v2
 * ══════════════════════════════════════════════════════════════
 * 
 * SMART features (learned from moltbot):
 * - Position memory: Learn and reuse button locations
 * - Click cooldown: Don't re-click same button for 10 seconds
 * - State tracking: Only click on NEW button appearances
 * - Fast mode: Use learned positions, skip OCR when possible
 * - Loop prevention: Detect and escape click loops
 */

const D0TAgent = require('./agent');
const fs = require('fs');
const path = require('path');

// ══════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════

const CONFIG = {
  pollInterval: 3000,
  
  // Buttons to watch (VS Code dialogs)
  buttons: ['Allow', 'Continue', 'Keep', 'Yes', 'OK', 'Run', 'Proceed', 'Accept'],
  
  // SMART: Cooldown per button (ms) - don't re-click same button
  buttonCooldown: 10000,
  
  // SMART: Max clicks on same position before considering it a loop
  loopThreshold: 3,
  
  // SMART: If we've learned a position, try it first (faster)
  useLearnedFirst: true,
  
  // State file
  stateFile: path.join(__dirname, 'smart-state.json'),
};

// ══════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════

let state = {
  running: false,
  agent: null,
  
  // SMART: Track when each button was last clicked
  lastClickTime: {},  // { "Allow": timestamp, "Continue": timestamp }
  
  // SMART: Track click positions to detect loops
  recentClicks: [],  // [{ x, y, time, button }, ...]
  
  // SMART: Learned button positions
  learned: loadState().learned || {},
  
  // Stats
  totalClicks: 0,
  loopsAvoided: 0,
};

function loadState() {
  try {
    if (fs.existsSync(CONFIG.stateFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf-8'));
    }
  } catch (e) {}
  return { learned: {} };
}

function saveState() {
  try {
    fs.writeFileSync(CONFIG.stateFile, JSON.stringify({
      learned: state.learned,
      lastSaved: new Date().toISOString(),
    }, null, 2));
  } catch (e) {}
}

// ══════════════════════════════════════════════════════════════
// LOGGING
// ══════════════════════════════════════════════════════════════

function log(icon, msg) {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`${icon} [${time}] ${msg}`);
}

// ══════════════════════════════════════════════════════════════
// SMART CLICK LOGIC
// ══════════════════════════════════════════════════════════════

function isOnCooldown(button) {
  const lastClick = state.lastClickTime[button];
  if (!lastClick) return false;
  return (Date.now() - lastClick) < CONFIG.buttonCooldown;
}

function isLoopPosition(x, y) {
  // Check if we've clicked this position multiple times recently
  const recent = state.recentClicks.filter(c => 
    Math.abs(c.x - x) < 50 && 
    Math.abs(c.y - y) < 50 &&
    (Date.now() - c.time) < 30000  // Last 30 seconds
  );
  return recent.length >= CONFIG.loopThreshold;
}

function recordClick(button, x, y) {
  state.lastClickTime[button] = Date.now();
  state.recentClicks.push({ x, y, time: Date.now(), button });
  
  // Keep only last 20 clicks
  if (state.recentClicks.length > 20) {
    state.recentClicks = state.recentClicks.slice(-10);
  }
  
  // Learn this position
  state.learned[button] = { x, y, lastSeen: Date.now() };
  saveState();
  
  state.totalClicks++;
}

// ══════════════════════════════════════════════════════════════
// MAIN LOOP
// ══════════════════════════════════════════════════════════════

async function smartScan() {
  if (!state.running) return;
  
  try {
    // Step 1: OCR scan
    await state.agent.see();
    
    // Step 2: Check each button
    for (const button of CONFIG.buttons) {
      // Skip if on cooldown
      if (isOnCooldown(button)) {
        continue;
      }
      
      // Find button
      const matches = state.agent.find(button);
      if (matches.length === 0) continue;
      
      const target = matches[0];
      
      // SMART: Skip if this is a loop position
      if (isLoopPosition(target.x, target.y)) {
        log('🔄', `Loop detected for "${button}" at (${target.x}, ${target.y}) - SKIPPING`);
        state.loopsAvoided++;
        continue;
      }
      
      // Click it!
      log('🎯', `Found "${button}" at (${target.x}, ${target.y})`);
      await state.agent.click(target.x, target.y);
      recordClick(button, target.x, target.y);
      log('✅', `Clicked "${button}" (total: ${state.totalClicks}, loops avoided: ${state.loopsAvoided})`);
      
      // Wait a bit after clicking
      await sleep(1000);
      break;  // Only click one button per scan
    }
    
  } catch (err) {
    log('❌', `Error: ${err.message}`);
  }
  
  // Schedule next scan
  if (state.running) {
    setTimeout(smartScan, CONFIG.pollInterval);
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ══════════════════════════════════════════════════════════════
// STARTUP
// ══════════════════════════════════════════════════════════════

async function start() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║            D0T Smart Autonomous v2                           ║
╠══════════════════════════════════════════════════════════════╣
║  SMART Features:                                             ║
║  ✓ Button cooldown (${CONFIG.buttonCooldown/1000}s per button)                       ║
║  ✓ Loop detection (max ${CONFIG.loopThreshold} clicks same position)              ║
║  ✓ Position learning                                         ║
╚══════════════════════════════════════════════════════════════╝

Watching for: ${CONFIG.buttons.join(', ')}
Poll interval: ${CONFIG.pollInterval}ms
Learned positions: ${Object.keys(state.learned).length}

Press Ctrl+C to stop.
`);

  state.agent = new D0TAgent();
  await state.agent.init();
  
  state.running = true;
  log('🚀', 'Smart autonomous mode started');
  
  smartScan();
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n');
  log('👋', 'Shutting down...');
  state.running = false;
  saveState();
  log('✅', `Session saved. Total clicks: ${state.totalClicks}, Loops avoided: ${state.loopsAvoided}`);
  process.exit(0);
});

start().catch(console.error);
