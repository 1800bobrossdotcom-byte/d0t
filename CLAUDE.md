# CLAUDE.md - D0T Agent Instructions

## What This Is

D0T is an autonomous desktop agent that can see, click, and type on your Windows screen. It gives Claude the ability to operate outside VS Code - navigating browsers, opening apps, and interacting with any UI.

## Quick Start

```powershell
cd c:\workspace\b0b-platform\d0t

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

## Electron App (Tray Icon)

```powershell
npm start
```

**Hotkeys:**
- Ctrl+Shift+D - Toggle cursor overlay
- Ctrl+Shift+1 - Guardian mode (green)
- Ctrl+Shift+2 - Turbo mode (amber)
- Ctrl+Shift+3 - Sword mode (red) 🔥

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

## Agent Loop Pattern

1. `see()` - Screenshot + OCR → get words with estimated positions
2. `find("text")` - Search OCR results for matching words
3. `clickOn("text")` - Find and click
4. `type("text")` - Send keystrokes
5. `see()` - Verify result

## Performance

| Operation | Time |
|-----------|------|
| Screenshot | ~320ms |
| OCR | ~3-4s |
| Click | ~100ms |
| Type | ~100ms |

## Notes

- OCR positions are estimates based on line number, not actual pixel coordinates
- Focus matters for typing - click target first
- Worker is cached after first OCR for better performance
- Special keys use SendKeys syntax: `{ENTER}`, `{TAB}`, `^l` (Ctrl+L)
