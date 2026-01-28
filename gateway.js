#!/usr/bin/env node
/**
 * D0T Gateway - WebSocket Control Plane
 * ══════════════════════════════════════════════════════════════
 * 
 * Inspired by moltbot's Gateway architecture:
 * - Central control plane for all D0T operations
 * - WebSocket server for real-time communication
 * - Task queue with persistent state
 * - Session management
 * - Multi-client support (CLI, Web, VS Code)
 * 
 * Usage:
 *   node gateway.js          - Start Gateway server
 *   node gateway.js --port 8089
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const D0TAgent = require('./agent');

// ══════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════

const PORT = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '8089');
const SESSION_FILE = path.join(__dirname, 'session.json');
const LOG_FILE = path.join(__dirname, 'gateway-log.json');
const { spawn } = require('child_process');

// ══════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════

const state = {
  agent: null,
  clients: new Set(),
  session: loadSession(),
  taskQueue: [],
  currentTask: null,
  history: [],
  autonomousProcess: null,
  stats: {
    totalActions: 0,
    totalClicks: 0,
    totalTypes: 0,
    uptime: Date.now(),
  },
};

function loadSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
    }
  } catch (e) {}
  return {
    id: `d0t-${Date.now()}`,
    startedAt: new Date().toISOString(),
    learnedPositions: {},  // Button text -> last known position
    preferences: {
      confirmClicks: false,  // Require confirmation before clicking
      verbose: true,
    },
  };
}

function saveSession() {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(state.session, null, 2));
  } catch (e) {
    console.error('Failed to save session:', e.message);
  }
}

// ══════════════════════════════════════════════════════════════
// LOGGING
// ══════════════════════════════════════════════════════════════

function log(level, message, data = {}) {
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...data,
  };
  
  state.history.push(entry);
  if (state.history.length > 1000) state.history.shift();
  
  const icons = {
    info: 'ℹ️', action: '🖱️', error: '❌', success: '✅',
    client: '🔗', task: '📋', agent: '🤖',
  };
  
  console.log(`${icons[level] || '•'} [${entry.time.split('T')[1].slice(0, 8)}] ${message}`);
  
  // Broadcast to all clients
  broadcast({ type: 'log', entry });
}

// ══════════════════════════════════════════════════════════════
// WEBSOCKET SERVER
// ══════════════════════════════════════════════════════════════

const server = http.createServer(handleHTTP);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const clientId = `client-${Date.now()}`;
  ws.clientId = clientId;
  state.clients.add(ws);
  
  log('client', `Connected: ${clientId} from ${req.socket.remoteAddress}`);
  
  // Send current state
  ws.send(JSON.stringify({
    type: 'welcome',
    session: state.session,
    stats: state.stats,
    history: state.history.slice(-50),
  }));
  
  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
      await handleMessage(ws, msg);
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: e.message }));
    }
  });
  
  ws.on('close', () => {
    state.clients.delete(ws);
    log('client', `Disconnected: ${clientId}`);
  });
});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const client of state.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// MESSAGE HANDLERS
// ══════════════════════════════════════════════════════════════

async function handleMessage(ws, msg) {
  const { type, payload } = msg;
  
  switch (type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', time: Date.now() }));
      break;
      
    case 'see':
      await handleSee(ws);
      break;
      
    case 'click':
      await handleClick(ws, payload);
      break;
      
    case 'clickOn':
      await handleClickOn(ws, payload);
      break;
      
    case 'type':
      await handleType(ws, payload);
      break;
      
    case 'hotkey':
      await handleHotkey(ws, payload);
      break;
      
    case 'urlBar':
      await handleUrlBar(ws, payload);
      break;
      
    case 'task':
      await handleTask(ws, payload);
      break;
      
    case 'register':
      // Autonomous controller registration
      ws.clientType = payload.name;
      log('client', `Registered: ${payload.name} v${payload.version}`);
      ws.send(JSON.stringify({ type: 'registered', session: state.session }));
      break;
      
    case 'autonomous-event':
      // Forward autonomous events to all other clients
      broadcast({ type: 'autonomous-event', payload });
      if (payload.type === 'clicked') {
        state.stats.totalActions++;
        state.stats.totalClicks++;
        log('action', `Autonomous clicked "${payload.pattern}" at (${payload.x}, ${payload.y})`);
      }
      break;
      
    case 'startAutonomous':
      await startAutonomousMode();
      ws.send(JSON.stringify({ type: 'autonomousStarted' }));
      break;
      
    case 'stopAutonomous':
      stopAutonomousMode();
      ws.send(JSON.stringify({ type: 'autonomousStopped' }));
      break;
      
    case 'getState':
      ws.send(JSON.stringify({
        type: 'state',
        session: state.session,
        stats: state.stats,
        taskQueue: state.taskQueue,
        currentTask: state.currentTask,
        autonomousRunning: state.autonomousProcess !== null,
      }));
      break;
      
    case 'setPreference':
      state.session.preferences[payload.key] = payload.value;
      saveSession();
      log('info', `Preference set: ${payload.key} = ${payload.value}`);
      break;
      
    default:
      log('error', `Unknown message type: ${type}`);
  }
}

async function ensureAgent() {
  if (!state.agent) {
    state.agent = new D0TAgent();
    await state.agent.init();
    log('agent', 'D0T Agent initialized');
  }
  return state.agent;
}

async function handleSee(ws) {
  const agent = await ensureAgent();
  const start = Date.now();
  
  await agent.see();
  const summary = agent.summarize();
  
  // Remember any button positions we found
  for (const pattern of ['Continue', 'Keep', 'Allow', 'Yes', 'OK', 'Run', 'Proceed']) {
    const matches = agent.find(pattern);
    if (matches.length > 0) {
      state.session.learnedPositions[pattern] = {
        x: matches[0].x,
        y: matches[0].y,
        seenAt: new Date().toISOString(),
      };
    }
  }
  saveSession();
  
  const result = {
    type: 'seeResult',
    summary,
    wordCount: agent.lastWords.length,
    elapsed: Date.now() - start,
    learnedPositions: state.session.learnedPositions,
  };
  
  ws.send(JSON.stringify(result));
  log('agent', `See: ${agent.lastWords.length} words in ${Date.now() - start}ms`);
}

async function handleClick(ws, { x, y }) {
  const agent = await ensureAgent();
  await agent.click(x, y);
  
  state.stats.totalActions++;
  state.stats.totalClicks++;
  
  ws.send(JSON.stringify({ type: 'clickResult', x, y, success: true }));
  log('action', `Click: (${x}, ${y})`);
}

async function handleClickOn(ws, { text, options = {} }) {
  const agent = await ensureAgent();
  await agent.see();
  
  let matches = agent.find(text, options);
  
  // Fallback to learned position if not found
  if (matches.length === 0 && state.session.learnedPositions[text]) {
    const learned = state.session.learnedPositions[text];
    log('info', `Using learned position for "${text}": (${learned.x}, ${learned.y})`);
    await agent.click(learned.x, learned.y);
    
    state.stats.totalActions++;
    state.stats.totalClicks++;
    
    ws.send(JSON.stringify({ 
      type: 'clickOnResult', 
      text, 
      success: true, 
      usedLearned: true,
      x: learned.x,
      y: learned.y,
    }));
    return;
  }
  
  if (matches.length === 0) {
    ws.send(JSON.stringify({ type: 'clickOnResult', text, success: false, reason: 'Not found' }));
    log('error', `Not found: "${text}"`);
    return;
  }
  
  const target = matches[0];
  await agent.click(target.x, target.y);
  
  // Learn this position
  state.session.learnedPositions[text] = {
    x: target.x,
    y: target.y,
    seenAt: new Date().toISOString(),
  };
  saveSession();
  
  state.stats.totalActions++;
  state.stats.totalClicks++;
  
  ws.send(JSON.stringify({ 
    type: 'clickOnResult', 
    text, 
    success: true, 
    x: target.x, 
    y: target.y,
  }));
  log('action', `ClickOn "${text}": (${target.x}, ${target.y})`);
}

async function handleType(ws, { text }) {
  const agent = await ensureAgent();
  await agent.type(text);
  
  state.stats.totalActions++;
  state.stats.totalTypes++;
  
  ws.send(JSON.stringify({ type: 'typeResult', text, success: true }));
  log('action', `Type: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
}

async function handleHotkey(ws, { keys }) {
  const agent = await ensureAgent();
  await agent.hotkey(keys);
  
  state.stats.totalActions++;
  
  ws.send(JSON.stringify({ type: 'hotkeyResult', keys, success: true }));
  log('action', `Hotkey: ${keys}`);
}

async function handleUrlBar(ws, { url }) {
  const agent = await ensureAgent();
  await agent.urlBar(url);
  
  state.stats.totalActions++;
  
  ws.send(JSON.stringify({ type: 'urlBarResult', url, success: true }));
  log('action', `URL: ${url}`);
}

// ══════════════════════════════════════════════════════════════
// AUTONOMOUS MODE CONTROL
// ══════════════════════════════════════════════════════════════

function startAutonomousMode() {
  if (state.autonomousProcess) {
    log('info', 'Autonomous mode already running');
    return;
  }
  
  log('agent', 'Starting autonomous mode...');
  
  state.autonomousProcess = spawn('node', ['autonomous.js'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  
  state.autonomousProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => {
      log('agent', `[AUTO] ${line}`);
      broadcast({ type: 'autonomousLog', message: line });
    });
  });
  
  state.autonomousProcess.stderr.on('data', (data) => {
    log('error', `[AUTO] ${data.toString()}`);
  });
  
  state.autonomousProcess.on('close', (code) => {
    log('info', `Autonomous mode exited with code ${code}`);
    state.autonomousProcess = null;
    broadcast({ type: 'autonomousStopped' });
  });
  
  broadcast({ type: 'autonomousStarted' });
}

function stopAutonomousMode() {
  if (!state.autonomousProcess) {
    log('info', 'Autonomous mode not running');
    return;
  }
  
  log('agent', 'Stopping autonomous mode...');
  state.autonomousProcess.kill('SIGINT');
  state.autonomousProcess = null;
  broadcast({ type: 'autonomousStopped' });
}

// ══════════════════════════════════════════════════════════════
// TASK SYSTEM - Queue and execute compound actions
// ══════════════════════════════════════════════════════════════

async function handleTask(ws, task) {
  const { name, actions, priority = 0 } = task;
  
  const taskItem = {
    id: `task-${Date.now()}`,
    name,
    actions,
    priority,
    status: 'queued',
    createdAt: new Date().toISOString(),
  };
  
  state.taskQueue.push(taskItem);
  state.taskQueue.sort((a, b) => b.priority - a.priority);
  
  log('task', `Task queued: ${name} (${actions.length} actions)`);
  
  ws.send(JSON.stringify({ type: 'taskQueued', task: taskItem }));
  
  // Process queue if not busy
  if (!state.currentTask) {
    processTaskQueue();
  }
}

async function processTaskQueue() {
  if (state.taskQueue.length === 0) {
    state.currentTask = null;
    return;
  }
  
  state.currentTask = state.taskQueue.shift();
  state.currentTask.status = 'running';
  state.currentTask.startedAt = new Date().toISOString();
  
  log('task', `Starting task: ${state.currentTask.name}`);
  broadcast({ type: 'taskStarted', task: state.currentTask });
  
  try {
    const agent = await ensureAgent();
    await agent.execute(state.currentTask.actions);
    
    state.currentTask.status = 'completed';
    state.currentTask.completedAt = new Date().toISOString();
    log('success', `Task completed: ${state.currentTask.name}`);
  } catch (err) {
    state.currentTask.status = 'failed';
    state.currentTask.error = err.message;
    log('error', `Task failed: ${state.currentTask.name} - ${err.message}`);
  }
  
  broadcast({ type: 'taskCompleted', task: state.currentTask });
  
  // Continue with next task
  setTimeout(() => processTaskQueue(), 100);
}

// ══════════════════════════════════════════════════════════════
// HTTP SERVER - Static files + API
// ══════════════════════════════════════════════════════════════

function handleHTTP(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  if (url.pathname === '/') {
    // Serve the D0T web interface
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getWebUI());
    return;
  }
  
  if (url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      session: state.session,
      stats: state.stats,
      clients: state.clients.size,
    }));
    return;
  }
  
  if (url.pathname === '/api/screenshot') {
    const screenshotPath = path.join(__dirname, 'screenshot.png');
    if (fs.existsSync(screenshotPath)) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(fs.readFileSync(screenshotPath));
      return;
    }
  }
  
  res.writeHead(404);
  res.end('Not found');
}

function getWebUI() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>D0T Gateway</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e0e0e0;
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid #333;
    }
    .logo {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, #ff6b6b, #ffd93d, #6bcb77);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 20px;
      color: #000;
    }
    h1 { font-size: 24px; }
    .status {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }
    .status.online { background: #1a3d1a; color: #6bcb77; }
    .status.offline { background: #3d1a1a; color: #ff6b6b; }
    .grid { display: grid; grid-template-columns: 1fr 400px; gap: 20px; }
    .panel {
      background: #1a1a1a;
      border-radius: 12px;
      padding: 16px;
      border: 1px solid #333;
    }
    .panel h2 {
      font-size: 14px;
      color: #888;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .controls {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 16px;
    }
    button {
      padding: 12px 16px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    button.primary {
      background: linear-gradient(135deg, #ff6b6b, #ee5a5a);
      color: white;
    }
    button.secondary {
      background: #2a2a2a;
      color: #e0e0e0;
    }
    button:hover { transform: translateY(-2px); filter: brightness(1.1); }
    button:active { transform: translateY(0); }
    .log {
      height: 400px;
      overflow-y: auto;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 12px;
      background: #0d0d0d;
      border-radius: 8px;
      padding: 12px;
    }
    .log-entry {
      padding: 4px 0;
      border-bottom: 1px solid #1a1a1a;
    }
    .log-entry .time { color: #666; margin-right: 8px; }
    .log-entry.error { color: #ff6b6b; }
    .log-entry.success { color: #6bcb77; }
    .log-entry.action { color: #ffd93d; }
    input[type="text"] {
      width: 100%;
      padding: 12px;
      border: 1px solid #333;
      border-radius: 8px;
      background: #0d0d0d;
      color: #e0e0e0;
      font-size: 14px;
      margin-bottom: 8px;
    }
    input[type="text"]:focus {
      outline: none;
      border-color: #ff6b6b;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }
    .stat {
      background: #0d0d0d;
      padding: 12px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-value { font-size: 24px; font-weight: 700; color: #ff6b6b; }
    .stat-label { font-size: 12px; color: #666; }
    .screenshot-preview {
      background: #0d0d0d;
      border-radius: 8px;
      padding: 8px;
      margin-top: 12px;
    }
    .screenshot-preview img {
      max-width: 100%;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">D0T</div>
      <h1>Gateway Control</h1>
      <span id="status" class="status offline">Connecting...</span>
      <span id="autoStatus" class="status offline" style="margin-left: 8px;">Auto: Off</span>
    </header>
    
    <div class="grid">
      <div class="main">
        <div class="panel">
          <h2>🤖 Autonomous Mode</h2>
          <div class="controls" style="grid-template-columns: 1fr 1fr; margin-bottom: 16px;">
            <button id="startAutoBtn" class="primary" onclick="startAutonomous()">▶️ Start Auto</button>
            <button id="stopAutoBtn" class="secondary" onclick="stopAutonomous()">⏹️ Stop Auto</button>
          </div>
          <p style="color: #888; font-size: 12px; margin-bottom: 16px;">
            Autonomous mode watches for approval buttons (Continue, Allow, Keep, Yes, OK) and clicks them automatically.
          </p>
          
          <h2>Quick Actions</h2>
          <div class="controls">
            <button class="primary" onclick="send('see')">👁️ See</button>
            <button class="secondary" onclick="clickOnPrompt()">🖱️ Click On</button>
            <button class="secondary" onclick="typePrompt()">⌨️ Type</button>
            <button class="secondary" onclick="send('hotkey', {keys: 'ctrl+l'})">📍 URL Bar</button>
            <button class="secondary" onclick="urlPrompt()">🌐 Navigate</button>
            <button class="secondary" onclick="send('getState')">📊 Refresh</button>
          </div>
          
          <h2>Custom Command</h2>
          <input type="text" id="customInput" placeholder="Enter text to click on or type..." />
          <div class="controls" style="grid-template-columns: 1fr 1fr;">
            <button class="secondary" onclick="clickOnCustom()">Click On</button>
            <button class="secondary" onclick="typeCustom()">Type Text</button>
          </div>
        </div>
        
        <div class="panel" style="margin-top: 16px;">
          <h2>Activity Log</h2>
          <div id="log" class="log"></div>
        </div>
      </div>
      
      <div class="sidebar">
        <div class="panel">
          <h2>Statistics</h2>
          <div class="stats">
            <div class="stat">
              <div id="totalActions" class="stat-value">0</div>
              <div class="stat-label">Actions</div>
            </div>
            <div class="stat">
              <div id="totalClicks" class="stat-value">0</div>
              <div class="stat-label">Clicks</div>
            </div>
            <div class="stat">
              <div id="totalTypes" class="stat-value">0</div>
              <div class="stat-label">Types</div>
            </div>
          </div>
        </div>
        
        <div class="panel" style="margin-top: 16px;">
          <h2>Last Screenshot</h2>
          <div class="screenshot-preview">
            <img id="screenshot" src="/api/screenshot" onerror="this.style.display='none'" />
          </div>
          <button class="secondary" style="width: 100%; margin-top: 8px;" onclick="refreshScreenshot()">
            🔄 Refresh Screenshot
          </button>
        </div>
      </div>
    </div>
  </div>
  
  <script>
    let ws;
    let autonomousRunning = false;
    const log = document.getElementById('log');
    
    function connect() {
      ws = new WebSocket('ws://' + location.host);
      
      ws.onopen = () => {
        document.getElementById('status').textContent = 'Online';
        document.getElementById('status').className = 'status online';
        addLog('info', 'Connected to D0T Gateway');
      };
      
      ws.onclose = () => {
        document.getElementById('status').textContent = 'Offline';
        document.getElementById('status').className = 'status offline';
        addLog('error', 'Disconnected - reconnecting...');
        setTimeout(connect, 3000);
      };
      
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        handleMessage(msg);
      };
    }
    
    function handleMessage(msg) {
      if (msg.type === 'welcome') {
        updateStats(msg.stats);
        msg.history.forEach(h => addLogEntry(h));
      } else if (msg.type === 'log') {
        addLogEntry(msg.entry);
      } else if (msg.type === 'state') {
        updateStats(msg.stats);
        updateAutoStatus(msg.autonomousRunning);
      } else if (msg.type === 'seeResult') {
        addLog('success', 'See: ' + msg.wordCount + ' words in ' + msg.elapsed + 'ms');
        refreshScreenshot();
      } else if (msg.type === 'clickOnResult') {
        if (msg.success) {
          addLog('action', 'Clicked "' + msg.text + '" at (' + msg.x + ', ' + msg.y + ')');
        } else {
          addLog('error', 'Not found: "' + msg.text + '"');
        }
      } else if (msg.type === 'autonomousStarted') {
        autonomousRunning = true;
        updateAutoStatus(true);
        addLog('success', '🤖 Autonomous mode STARTED');
      } else if (msg.type === 'autonomousStopped') {
        autonomousRunning = false;
        updateAutoStatus(false);
        addLog('info', '🛑 Autonomous mode STOPPED');
      } else if (msg.type === 'autonomousLog') {
        addLog('info', msg.message);
      } else if (msg.type === 'autonomous-event') {
        if (msg.payload.type === 'clicked') {
          addLog('action', '🤖 Auto-clicked "' + msg.payload.pattern + '" at (' + msg.payload.x + ', ' + msg.payload.y + ')');
          refreshScreenshot();
        }
      }
    }
    
    function send(type, payload = {}) {
      ws.send(JSON.stringify({ type, payload }));
    }
    
    function startAutonomous() {
      send('startAutonomous');
    }
    
    function stopAutonomous() {
      send('stopAutonomous');
    }
    
    function updateAutoStatus(running) {
      const el = document.getElementById('autoStatus');
      if (running) {
        el.textContent = 'Auto: ON';
        el.className = 'status online';
      } else {
        el.textContent = 'Auto: Off';
        el.className = 'status offline';
      }
    }
    
    function clickOnPrompt() {
      const text = prompt('Enter text to click on:');
      if (text) send('clickOn', { text });
    }
    
    function typePrompt() {
      const text = prompt('Enter text to type:');
      if (text) send('type', { text });
    }
    
    function urlPrompt() {
      const url = prompt('Enter URL:');
      if (url) send('urlBar', { url });
    }
    
    function clickOnCustom() {
      const text = document.getElementById('customInput').value;
      if (text) send('clickOn', { text });
    }
    
    function typeCustom() {
      const text = document.getElementById('customInput').value;
      if (text) send('type', { text });
    }
    
    function updateStats(stats) {
      document.getElementById('totalActions').textContent = stats.totalActions;
      document.getElementById('totalClicks').textContent = stats.totalClicks;
      document.getElementById('totalTypes').textContent = stats.totalTypes;
    }
    
    function addLog(level, message) {
      addLogEntry({ time: new Date().toISOString(), level, message });
    }
    
    function addLogEntry(entry) {
      const div = document.createElement('div');
      div.className = 'log-entry ' + entry.level;
      const time = entry.time.split('T')[1].slice(0, 8);
      div.innerHTML = '<span class="time">' + time + '</span>' + entry.message;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    }
    
    function refreshScreenshot() {
      const img = document.getElementById('screenshot');
      img.style.display = 'block';
      img.src = '/api/screenshot?t=' + Date.now();
    }
    
    connect();
  </script>
</body>
</html>`;
}

// ══════════════════════════════════════════════════════════════
// STARTUP
// ══════════════════════════════════════════════════════════════

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    D0T Gateway v1.0                          ║
╠══════════════════════════════════════════════════════════════╣
║  WebSocket: ws://localhost:${PORT}                             ║
║  HTTP:      http://localhost:${PORT}                           ║
║  Status:    http://localhost:${PORT}/api/status                ║
╚══════════════════════════════════════════════════════════════╝

Session: ${state.session.id}
Uptime:  ${new Date().toISOString()}

Waiting for connections...
  `);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\nShutting down...');
  saveSession();
  if (state.agent) await state.agent.cleanup();
  process.exit(0);
});
