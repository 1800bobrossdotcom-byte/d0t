# CLAUDE.md - D0T Agent Instructions

## What This Is

D0T is an autonomous desktop agent that can see, click, and type on your Windows screen. It gives Claude the ability to operate outside VS Code - navigating browsers, opening apps, and interacting with any UI.

**Inspired by moltbot architecture:**
- Gateway WebSocket control plane
- Browser CDP for precise web automation
- Session/state persistence
- Multi-client support

---

## Quick Start

```powershell
cd c:\workspace\b0b-platform\d0t

# === BASIC COMMANDS ===

# See the screen (screenshot + OCR)
node agent.js see

# Find something on screen
node agent.js find "Chrome"

# Click on text
node agent.js clickOn "File"

# Type text
node agent.js type "Hello from D0T"

# Navigate browser (Ctrl+L, type URL, Enter)
node agent.js url "github.com"

# Open app via Windows search
node agent.js open "Chrome"
```

---

## Gateway Server (WebSocket Control Plane)

The Gateway provides a central control point for all D0T operations:

```powershell
# Start the Gateway
node gateway.js

# Web UI: http://localhost:8089
# WebSocket: ws://localhost:8089
# API: http://localhost:8089/api/status
```

**Gateway Features:**
- Real-time WebSocket communication
- Task queue with priorities
- Session persistence (learned button positions!)
- Multiple client support
- Web UI for monitoring/control

### Connecting to Gateway

```javascript
const ws = new WebSocket('ws://localhost:8089');

// Send commands
ws.send(JSON.stringify({ type: 'see' }));
ws.send(JSON.stringify({ type: 'clickOn', payload: { text: 'Allow' } }));
ws.send(JSON.stringify({ type: 'type', payload: { text: 'Hello' } }));

// Task queue (compound actions)
ws.send(JSON.stringify({
  type: 'task',
  payload: {
    name: 'Open GitHub',
    actions: [
      { type: 'hotkey', params: { keys: 'ctrl+l' } },
      { type: 'wait', params: { ms: 100 } },
      { type: 'type', params: { text: 'github.com' } },
      { type: 'press', params: { key: '{ENTER}' } },
    ]
  }
}));
```

---

## Browser Control (Chrome DevTools Protocol)

For precise web automation without OCR:

```powershell
# First, start Chrome with remote debugging:
chrome --remote-debugging-port=9222

# Test connection
node browser.js connect

# Navigate
node browser.js goto "https://github.com"

# Click by CSS selector
node browser.js click "#login-button"

# Click by text content
node browser.js clickText "Sign in"

# Type into field
node browser.js type "#username" "my-user"

# Get page info
node browser.js info

# Take screenshot
node browser.js screenshot
```

### Browser API

```javascript
const D0TBrowser = require('./browser');

const browser = new D0TBrowser();
await browser.connect();

// Navigation
await browser.goto('https://example.com');
const url = await browser.getUrl();
const title = await browser.getTitle();

// Interaction
await browser.click('#submit');
await browser.clickText('Continue');
await browser.type('#search', 'hello');
await browser.press('Enter');
await browser.hotkey('ctrl+l');

// Information
const info = await browser.getPageInfo();
const text = await browser.getText('.message');
const exists = await browser.exists('#popup');

// JavaScript execution
const result = await browser.evaluate('document.title');

// Screenshot
await browser.screenshotToFile('page.png');
```

---

## Electron App (Tray Icon)

```powershell
npm start
```

**Hotkeys:**
- Ctrl+Shift+D - Toggle cursor overlay
- Ctrl+Shift+1 - Guardian mode (green)
- Ctrl+Shift+2 - Turbo mode (amber)
- Ctrl+Shift+3 - Sword mode (red) 🔥

---

## Low-Level Scripts

```powershell
# Screenshot
powershell -ExecutionPolicy Bypass -File screenshot.ps1

# Click at coordinates
powershell -ExecutionPolicy Bypass -File click.ps1 500 300

# Type text
powershell -ExecutionPolicy Bypass -File type.ps1 "text here"

# Press key
powershell -ExecutionPolicy Bypass -File press.ps1 "{ENTER}"
```

---

## Ghost Mode (Autonomous Button Clicking)

For hands-free approval button clicking:

```powershell
node ghost.js
```

Ghost watches for common UI buttons (Continue, Keep, Allow, Yes, OK) and clicks them automatically.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     D0T Gateway                              │
│                  (WebSocket Server)                          │
│                   ws://localhost:8089                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐                │
│   │  Agent  │    │ Browser │    │  Ghost  │                │
│   │  (OCR)  │    │  (CDP)  │    │  (Auto) │                │
│   └────┬────┘    └────┬────┘    └────┬────┘                │
│        │              │              │                       │
│        v              v              v                       │
│   ┌─────────────────────────────────────┐                   │
│   │         PowerShell Scripts          │                   │
│   │   screenshot.ps1 | click.ps1 | ...  │                   │
│   └─────────────────────────────────────┘                   │
│                        │                                     │
│                        v                                     │
│   ┌─────────────────────────────────────┐                   │
│   │         Windows Input API           │                   │
│   │   (user32.dll mouse_event, etc.)    │                   │
│   └─────────────────────────────────────┘                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Agent Loop Pattern

1. `see()` - Screenshot + OCR → get words with positions
2. `find("text")` - Search OCR results for matching words
3. `clickOn("text")` - Find and click
4. `type("text")` - Send keystrokes
5. `see()` - Verify result

---

## Performance

| Operation | Agent (OCR) | Browser (CDP) |
|-----------|-------------|---------------|
| Screenshot | ~320ms | ~50ms |
| Find element | ~3-4s (OCR) | ~1ms (DOM) |
| Click | ~100ms | ~10ms |
| Type | ~100ms | ~10ms |

**Recommendation:** Use Browser CDP for web pages, Agent for desktop apps.

---

## Files

| File | Purpose |
|------|---------|
| `agent.js` | Core agent with see/click/type |
| `gateway.js` | WebSocket control plane |
| `browser.js` | Chrome DevTools Protocol |
| `ghost.js` | Autonomous button watcher |
| `main.js` | Electron tray app |
| `screenshot.ps1` | Windows screenshot |
| `click.ps1` | Mouse click |
| `type.ps1` | Keyboard typing |
| `press.ps1` | Key press |
| `session.json` | Persistent state |

---

## Notes

- OCR positions are estimates; Browser CDP is precise
- Focus matters for typing - click target first
- Worker is cached after first OCR for better performance
- Special keys use SendKeys syntax: `{ENTER}`, `{TAB}`, `^l` (Ctrl+L)
- Gateway learns button positions from successful clicks
- Start Chrome with `--remote-debugging-port=9222` for CDP
