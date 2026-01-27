// ═══════════════════════════════════════════════════════════════════════════
// D0T.dev - The Bridge Between Human and AI
// "The dot that connects you to b0b"
// ═══════════════════════════════════════════════════════════════════════════

const { app, BrowserWindow, Tray, Menu, globalShortcut, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

let dotWindow = null;
let dashWindow = null;
let tray = null;
let ghostInterval = null;  // Ghost mode watcher

const state = {
  active: false,
  mode: 'guardian',
  mouse: false,
  screenshot: true,
  autonomous: false,
  ghostActive: false,
  ghostStats: { clicks: 0, lastClick: null }
};

const MODES = {
  guardian: {
    name: '🛡️ GUARDIAN',
    desc: 'Safe mode - observe only',
    mouse: false,
    screenshot: true,
    autonomous: false,
    ghost: false,
    color: '#10b981' // emerald
  },
  turbo: {
    name: '⚡ TURB0B00ST', 
    desc: 'Sprint mode - full assist + ghost',
    mouse: true,
    screenshot: true,
    autonomous: false,
    ghost: true,  // Enable ghost in turbo
    color: '#f59e0b' // amber/joy
  },
  sword: {
    name: '🗡️ FLAMING SWORD',
    desc: 'Autonomous overnight - ghost active',
    mouse: true,
    screenshot: true,
    autonomous: true,
    ghost: true,  // Enable ghost in sword mode
    color: '#ef4444' // red/alert
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// D0T CURSOR - The pulsing connection point
// ═══════════════════════════════════════════════════════════════════════════

function createDot() {
  dotWindow = new BrowserWindow({
    width: 60,
    height: 60,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  dotWindow.loadFile('dot.html');
  dotWindow.setIgnoreMouseEvents(true);
  
  setInterval(() => {
    if (dotWindow && state.active) {
      const point = screen.getCursorScreenPoint();
      dotWindow.setPosition(point.x - 30, point.y - 30);
    }
  }, 16);
  
  dotWindow.hide();
}

function toggleDot() {
  state.active = !state.active;
  if (state.active) {
    dotWindow.show();
    dotWindow.webContents.send('set-mode', state.mode);
    console.log(`🔥 D0T ACTIVE [${MODES[state.mode].name}]`);
  } else {
    dotWindow.hide();
    console.log('· d0t idle');
  }
  updateTray();
}

// ═══════════════════════════════════════════════════════════════════════════
// MODE SWITCHING
// ═══════════════════════════════════════════════════════════════════════════

function setMode(modeName) {
  if (!MODES[modeName]) return;
  
  const mode = MODES[modeName];
  state.mode = modeName;
  state.mouse = mode.mouse;
  state.screenshot = mode.screenshot;
  state.autonomous = mode.autonomous;
  
  // Ghost mode control
  if (mode.ghost) {
    startGhost();
  } else {
    stopGhost();
  }
  
  if (dotWindow) {
    dotWindow.webContents.send('set-mode', modeName);
  }
  
  console.log(`\n${'═'.repeat(40)}`);
  console.log(`  ${mode.name}`);
  console.log(`  ${mode.desc}`);
  if (mode.ghost) console.log(`  👻 Ghost mode: ACTIVE`);
  console.log(`${'═'.repeat(40)}\n`);
  
  updateTray();
}

// ═══════════════════════════════════════════════════════════════════════════
// MOUSE CONTROL
// ═══════════════════════════════════════════════════════════════════════════

function ps(script) {
  const temp = path.join(__dirname, '_ps.ps1');
  fs.writeFileSync(temp, script);
  try {
    return execSync(`powershell -ExecutionPolicy Bypass -File "${temp}"`, { 
      encoding: 'utf8', 
      windowsHide: true 
    }).trim();
  } finally {
    try { fs.unlinkSync(temp); } catch {}
  }
}

function mouseMove(x, y) {
  if (!state.mouse) {
    console.log('⚠️ Mouse disabled in current mode');
    return false;
  }
  ps(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})
`);
  return true;
}

function mousePos() {
  const result = ps(`
Add-Type -AssemblyName System.Windows.Forms
$p = [System.Windows.Forms.Cursor]::Position
Write-Output "$($p.X),$($p.Y)"
`);
  const [x, y] = result.split(',').map(Number);
  return { x, y };
}

function screenshot(filename) {
  if (!state.screenshot) return null;
  
  const out = path.resolve(filename || `d0t-${Date.now()}.png`);
  ps(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$b = New-Object System.Drawing.Bitmap($s.Width, $s.Height)
$g = [System.Drawing.Graphics]::FromImage($b)
$g.CopyFromScreen(0, 0, 0, 0, $b.Size)
$b.Save('${out.replace(/\\/g, '\\\\')}')
$g.Dispose()
$b.Dispose()
`);
  console.log(`📸 ${out}`);
  return out;
}

function mouseClick(x, y) {
  if (!state.mouse) {
    console.log('⚠️ Mouse disabled in current mode');
    return false;
  }
  ps(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseOps {
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    public const int MOUSEEVENTF_LEFTDOWN = 0x02;
    public const int MOUSEEVENTF_LEFTUP = 0x04;
}
"@
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})
Start-Sleep -Milliseconds 50
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
`);
  console.log(`🖱️ Clicked at (${x}, ${y})`);
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// GHOST MODE - Autonomous UI Watcher
// Watches for Claude pause buttons and clicks them automatically
// ═══════════════════════════════════════════════════════════════════════════

const GHOST_BUTTONS = ['Continue', 'Allow', 'Keep', 'Run', 'Yes', 'OK', 'Proceed'];
const GHOST_POLL_MS = 3000;

async function ghostScan() {
  if (!state.ghostActive) return;
  
  try {
    // Take screenshot
    const imgPath = path.join(__dirname, 'ghost-screen.png');
    screenshot(imgPath);
    
    // OCR with vision-core
    const vision = require('./vision-core.js');
    const result = await vision.readScreen(imgPath);
    
    if (result.bestAction && result.bestAction.x && result.bestAction.y) {
      const btn = result.bestAction;
      console.log(`👻 Ghost found "${btn.match}" at (${btn.x}, ${btn.y})`);
      
      // Click it!
      mouseClick(btn.x, btn.y);
      state.ghostStats.clicks++;
      state.ghostStats.lastClick = new Date().toISOString();
      
      console.log(`✅ Ghost clicked! Total: ${state.ghostStats.clicks}`);
    }
  } catch (err) {
    console.log(`👻 Ghost scan error: ${err.message}`);
  }
}

function startGhost() {
  if (ghostInterval) return; // Already running
  
  state.ghostActive = true;
  console.log(`\n👻 GHOST MODE ACTIVATED`);
  console.log(`   Watching for: ${GHOST_BUTTONS.join(', ')}`);
  console.log(`   Poll interval: ${GHOST_POLL_MS}ms\n`);
  
  ghostInterval = setInterval(ghostScan, GHOST_POLL_MS);
  ghostScan(); // First scan immediately
}

function stopGhost() {
  if (ghostInterval) {
    clearInterval(ghostInterval);
    ghostInterval = null;
  }
  state.ghostActive = false;
  console.log(`👻 Ghost mode deactivated (${state.ghostStats.clicks} total clicks)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM TRAY
// ═══════════════════════════════════════════════════════════════════════════

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png'));
  updateTray();
  tray.on('click', toggleDot);
}

function updateTray() {
  const mode = MODES[state.mode];
  const ghostStatus = state.ghostActive ? '👻 GHOST ACTIVE' : '';
  
  const menu = Menu.buildFromTemplate([
    { label: `D0T ${state.active ? '🔥 ACTIVE' : '· idle'} ${ghostStatus}`, enabled: false },
    { label: mode.name, enabled: false },
    { type: 'separator' },
    { label: '🛡️ Guardian', type: 'radio', checked: state.mode === 'guardian', click: () => setMode('guardian') },
    { label: '⚡ TURB0B00ST', type: 'radio', checked: state.mode === 'turbo', click: () => setMode('turbo') },
    { label: '🗡️ FLAMING SWORD', type: 'radio', checked: state.mode === 'sword', click: () => setMode('sword') },
    { type: 'separator' },
    { label: '😴 SLEEP MODE (Ghost Only)', click: () => {
      // Special mode: just ghost, no cursor
      state.active = false;
      dotWindow?.hide();
      setMode('sword');
      console.log('\n😴 SLEEP MODE: Ghost watching while you rest\n');
    }},
    { type: 'separator' },
    { label: state.ghostActive ? `👻 Ghost: ${state.ghostStats.clicks} clicks` : '👻 Ghost: OFF', enabled: false },
    { label: state.active ? 'Hide D0T' : 'Show D0T', click: toggleDot },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  
  tray.setToolTip(`D0T - ${mode.name} ${ghostStatus}`);
  tray.setContextMenu(menu);
}

// ═══════════════════════════════════════════════════════════════════════════
// APP LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════

app.whenReady().then(async () => {
  // Create icon if needed
  const iconPath = path.join(__dirname, 'icon.png');
  if (!fs.existsSync(iconPath)) {
    const sharp = require('sharp');
    const svg = `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="14" fill="#f59e0b"/>
      <circle cx="16" cy="16" r="8" fill="#f97316"/>
      <circle cx="16" cy="16" r="4" fill="#fff"/>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(iconPath);
  }

  createDot();
  createTray();
  
  // Hotkeys
  globalShortcut.register('CommandOrControl+Shift+D', toggleDot);
  globalShortcut.register('CommandOrControl+Shift+1', () => setMode('guardian'));
  globalShortcut.register('CommandOrControl+Shift+2', () => setMode('turbo'));
  globalShortcut.register('CommandOrControl+Shift+3', () => setMode('sword'));
  
  console.log(`
${'═'.repeat(50)}

    ██████╗  ██████╗ ████████╗
    ██╔══██╗██╔═████╗╚══██╔══╝
    ██║  ██║██║██╔██║   ██║   
    ██║  ██║████╔╝██║   ██║   
    ██████╔╝╚██████╔╝   ██║   
    ╚═════╝  ╚═════╝    ╚═╝   
                          .dev

${'═'.repeat(50)}
  The bridge between human and AI
  
  Ctrl+Shift+D   Toggle D0T cursor
  Ctrl+Shift+1   🛡️ Guardian mode
  Ctrl+Shift+2   ⚡ TURB0B00ST mode  
  Ctrl+Shift+3   🗡️ FLAMING SWORD mode
${'═'.repeat(50)}
`);

  setMode('guardian');
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopGhost();  // Clean up ghost on quit
});
app.on('window-all-closed', e => e.preventDefault());

// Export for external use
module.exports = { mouseMove, mousePos, mouseClick, screenshot, setMode, state, startGhost, stopGhost };
