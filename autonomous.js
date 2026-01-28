#!/usr/bin/env node
/**
 * D0T Autonomous Controller
 * ══════════════════════════════════════════════════════════════
 * 
 * Full moltbot-inspired autonomous agent that:
 * - Watches for approval buttons (Continue, Allow, Keep, Yes, OK)
 * - Monitors VS Code for tool approval dialogs
 * - Learns button positions for faster clicking
 * - Integrates with Gateway for remote control
 * - Supports voice commands via Windows Speech Recognition
 * 
 * Usage:
 *   node autonomous.js              - Start autonomous mode
 *   node autonomous.js --aggressive - Faster polling, more actions
 *   node autonomous.js --voice      - Enable voice commands
 */

const D0TAgent = require('./agent');
const D0TBrowser = require('./browser');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const WebSocket = require('ws');

// ══════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════

const CONFIG = {
  // Polling
  pollInterval: process.argv.includes('--aggressive') ? 2000 : 5000,
  
  // Buttons to auto-click (priority order)
  autoClickPatterns: [
    'Continue', 'Keep', 'Allow', 'Proceed', 'Yes', 'Run', 'OK',
    'Accept', 'Confirm', 'Submit', 'Next', 'Approve',
    'Allow and Review',  // VS Code specific
  ],
  
  // Require confirmation scans before clicking
  confirmScans: 2,
  
  // Rate limiting
  maxActionsPerMinute: 20,
  cooldownAfterClick: 1000,
  
  // Voice commands
  voiceEnabled: process.argv.includes('--voice'),
  
  // Gateway connection
  gatewayUrl: 'ws://localhost:8089',
  
  // Learning
  sessionFile: path.join(__dirname, 'autonomous-session.json'),
  logFile: path.join(__dirname, 'autonomous-log.json'),
};

// ══════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════

const state = {
  running: false,
  agent: null,
  browser: null,
  gateway: null,
  
  // Tracking
  actionsThisMinute: 0,
  lastAction: 0,
  totalActions: 0,
  
  // Confirmation system (see button twice before clicking)
  pendingButton: null,
  pendingCount: 0,
  pendingPos: null,
  
  // Learning
  session: loadSession(),
  
  // Voice
  voiceProcess: null,
};

function loadSession() {
  try {
    if (fs.existsSync(CONFIG.sessionFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.sessionFile, 'utf-8'));
    }
  } catch (e) {}
  return {
    startedAt: new Date().toISOString(),
    learnedPositions: {},
    clickHistory: [],
    totalClicks: 0,
    successfulPatterns: {},
  };
}

function saveSession() {
  try {
    fs.writeFileSync(CONFIG.sessionFile, JSON.stringify(state.session, null, 2));
  } catch (e) {}
}

function logAction(action) {
  const entry = {
    time: new Date().toISOString(),
    ...action,
  };
  
  state.session.clickHistory.push(entry);
  if (state.session.clickHistory.length > 500) {
    state.session.clickHistory = state.session.clickHistory.slice(-250);
  }
  
  saveSession();
  
  // Also append to log file
  try {
    let logs = [];
    if (fs.existsSync(CONFIG.logFile)) {
      logs = JSON.parse(fs.readFileSync(CONFIG.logFile, 'utf-8'));
    }
    logs.push(entry);
    if (logs.length > 1000) logs = logs.slice(-500);
    fs.writeFileSync(CONFIG.logFile, JSON.stringify(logs, null, 2));
  } catch (e) {}
}

// ══════════════════════════════════════════════════════════════
// LOGGING
// ══════════════════════════════════════════════════════════════

function log(icon, msg, detail = '') {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`${icon} [${time}] ${msg}${detail ? ' ' + detail : ''}`);
}

// ══════════════════════════════════════════════════════════════
// GATEWAY CONNECTION
// ══════════════════════════════════════════════════════════════

function connectGateway() {
  try {
    state.gateway = new WebSocket(CONFIG.gatewayUrl);
    
    state.gateway.on('open', () => {
      log('🔗', 'Connected to Gateway');
      state.gateway.send(JSON.stringify({
        type: 'register',
        payload: { name: 'autonomous', version: '1.0' },
      }));
    });
    
    state.gateway.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        handleGatewayMessage(msg);
      } catch (e) {}
    });
    
    state.gateway.on('close', () => {
      log('⚠️', 'Gateway disconnected, reconnecting...');
      setTimeout(connectGateway, 5000);
    });
    
    state.gateway.on('error', () => {
      // Gateway might not be running, that's OK
    });
  } catch (e) {
    // Gateway not available
  }
}

function handleGatewayMessage(msg) {
  switch (msg.type) {
    case 'command':
      // Remote commands from Gateway
      if (msg.payload.action === 'stop') {
        log('🛑', 'Stop command received');
        state.running = false;
      } else if (msg.payload.action === 'click') {
        clickAt(msg.payload.x, msg.payload.y);
      }
      break;
  }
}

function notifyGateway(event) {
  if (state.gateway?.readyState === WebSocket.OPEN) {
    state.gateway.send(JSON.stringify({
      type: 'autonomous-event',
      payload: event,
    }));
  }
}

// ══════════════════════════════════════════════════════════════
// VOICE COMMANDS (Windows Speech Recognition)
// ══════════════════════════════════════════════════════════════

function startVoiceRecognition() {
  if (!CONFIG.voiceEnabled) return;
  
  log('🎤', 'Starting voice recognition...');
  
  // PowerShell script for Windows Speech Recognition
  const voiceScript = `
Add-Type -AssemblyName System.Speech
$recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
$recognizer.SetInputToDefaultAudioDevice()

# Grammar for D0T commands
$grammar = New-Object System.Speech.Recognition.GrammarBuilder
$choices = New-Object System.Speech.Recognition.Choices
$choices.Add(@("dot click", "dot stop", "dot continue", "dot screenshot", "dot status"))
$grammar.Append($choices)
$recognizer.LoadGrammar((New-Object System.Speech.Recognition.Grammar($grammar)))

$recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)

$recognizer.add_SpeechRecognized({
    param($sender, $e)
    Write-Host "VOICE:$($e.Result.Text)"
})

Write-Host "Voice recognition started. Say 'dot' followed by a command."
while ($true) { Start-Sleep -Seconds 1 }
`;

  const tempFile = path.join(__dirname, '_voice.ps1');
  fs.writeFileSync(tempFile, voiceScript);
  
  state.voiceProcess = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', tempFile]);
  
  state.voiceProcess.stdout.on('data', (data) => {
    const line = data.toString().trim();
    if (line.startsWith('VOICE:')) {
      const command = line.replace('VOICE:', '').toLowerCase();
      handleVoiceCommand(command);
    }
  });
  
  state.voiceProcess.on('error', (err) => {
    log('❌', 'Voice recognition failed:', err.message);
  });
}

function handleVoiceCommand(command) {
  log('🎤', `Voice command: "${command}"`);
  
  if (command.includes('click')) {
    // Click the first found button
    scanAndClick();
  } else if (command.includes('stop')) {
    state.running = false;
    log('🛑', 'Stopping by voice command');
  } else if (command.includes('continue')) {
    clickOnText('Continue');
  } else if (command.includes('screenshot')) {
    state.agent?.screenshot();
    log('📸', 'Screenshot taken');
  } else if (command.includes('status')) {
    log('📊', `Status: ${state.totalActions} actions, running: ${state.running}`);
  }
}

// ══════════════════════════════════════════════════════════════
// CORE AUTONOMOUS LOGIC
// ══════════════════════════════════════════════════════════════

async function initialize() {
  log('🤖', 'Initializing D0T Autonomous...');
  
  // Initialize agent
  state.agent = new D0TAgent();
  await state.agent.init();
  log('✅', 'Agent ready');
  
  // Try to connect to browser (optional)
  try {
    state.browser = new D0TBrowser();
    await state.browser.connect();
    log('✅', 'Browser CDP connected');
  } catch (e) {
    log('ℹ️', 'Browser CDP not available (run Chrome with --remote-debugging-port=9222)');
    state.browser = null;
  }
  
  // Connect to Gateway (optional)
  connectGateway();
  
  // Start voice recognition (if enabled)
  startVoiceRecognition();
  
  log('✅', 'Initialization complete');
}

async function scanAndClick() {
  // Rate limiting
  if (state.actionsThisMinute >= CONFIG.maxActionsPerMinute) {
    return null;
  }
  
  // Cooldown
  if (Date.now() - state.lastAction < CONFIG.cooldownAfterClick) {
    return null;
  }
  
  // Take screenshot and OCR
  const start = Date.now();
  await state.agent.see();
  const scanTime = Date.now() - start;
  
  // Find buttons
  for (const pattern of CONFIG.autoClickPatterns) {
    const matches = state.agent.find(pattern);
    
    if (matches.length > 0) {
      const match = matches[0];
      
      // Confirmation system: need to see button twice
      if (state.pendingButton === pattern && 
          Math.abs(state.pendingPos.x - match.x) < 50 &&
          Math.abs(state.pendingPos.y - match.y) < 50) {
        state.pendingCount++;
        
        if (state.pendingCount >= CONFIG.confirmScans) {
          // Confirmed! Click it
          log('🎯', `Confirmed "${pattern}" at (${match.x}, ${match.y})`, `[${state.pendingCount} scans]`);
          
          await clickAt(match.x, match.y);
          
          // Learn this position
          state.session.learnedPositions[pattern] = {
            x: match.x,
            y: match.y,
            lastSeen: new Date().toISOString(),
            clickCount: (state.session.learnedPositions[pattern]?.clickCount || 0) + 1,
          };
          
          // Track success
          state.session.successfulPatterns[pattern] = 
            (state.session.successfulPatterns[pattern] || 0) + 1;
          
          // Log action
          logAction({
            action: 'click',
            pattern,
            x: match.x,
            y: match.y,
            scanTime,
          });
          
          // Reset pending
          state.pendingButton = null;
          state.pendingCount = 0;
          state.pendingPos = null;
          
          // Notify Gateway
          notifyGateway({
            type: 'clicked',
            pattern,
            x: match.x,
            y: match.y,
          });
          
          saveSession();
          return { pattern, x: match.x, y: match.y };
        }
      } else {
        // First time seeing this button
        state.pendingButton = pattern;
        state.pendingCount = 1;
        state.pendingPos = { x: match.x, y: match.y };
        log('👁️', `Saw "${pattern}" at (${match.x}, ${match.y})`, '[confirming...]');
      }
      
      return null; // Wait for confirmation
    }
  }
  
  // Nothing found, reset pending
  state.pendingButton = null;
  state.pendingCount = 0;
  state.pendingPos = null;
  
  return null;
}

async function clickAt(x, y) {
  await state.agent.click(x, y);
  
  state.lastAction = Date.now();
  state.actionsThisMinute++;
  state.totalActions++;
  state.session.totalClicks++;
  
  log('🖱️', `Click (${x}, ${y})`, `[total: ${state.totalActions}]`);
}

async function clickOnText(text) {
  await state.agent.see();
  const success = await state.agent.clickOn(text);
  
  if (success) {
    state.lastAction = Date.now();
    state.actionsThisMinute++;
    state.totalActions++;
    state.session.totalClicks++;
    
    logAction({ action: 'clickOn', text });
  }
  
  return success;
}

// ══════════════════════════════════════════════════════════════
// MAIN LOOP
// ══════════════════════════════════════════════════════════════

async function mainLoop() {
  state.running = true;
  
  log('🚀', 'Autonomous mode ACTIVE');
  log('ℹ️', `Watching for: ${CONFIG.autoClickPatterns.slice(0, 5).join(', ')}...`);
  log('ℹ️', `Poll interval: ${CONFIG.pollInterval}ms`);
  
  // Reset rate limiter every minute
  setInterval(() => {
    state.actionsThisMinute = 0;
  }, 60000);
  
  while (state.running) {
    try {
      await scanAndClick();
    } catch (err) {
      log('❌', 'Scan error:', err.message);
    }
    
    await sleep(CONFIG.pollInterval);
  }
  
  log('🛑', 'Autonomous mode stopped');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ══════════════════════════════════════════════════════════════
// STARTUP
// ══════════════════════════════════════════════════════════════

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              D0T Autonomous Controller v1.0                   ║
╠══════════════════════════════════════════════════════════════╣
║  Watching for approval buttons and clicking automatically     ║
║  Press Ctrl+C to stop                                        ║
╚══════════════════════════════════════════════════════════════╝
`);
  
  await initialize();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n');
    log('👋', 'Shutting down...');
    state.running = false;
    saveSession();
    
    if (state.voiceProcess) {
      state.voiceProcess.kill();
    }
    
    if (state.agent) {
      await state.agent.cleanup();
    }
    
    if (state.browser) {
      await state.browser.close();
    }
    
    log('✅', `Session saved. Total actions: ${state.totalActions}`);
    process.exit(0);
  });
  
  // Start the main loop
  await mainLoop();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
