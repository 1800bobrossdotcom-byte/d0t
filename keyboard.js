#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// D0T KEYBOARD - Type text, press keys, full keyboard control
// ═══════════════════════════════════════════════════════════════════════════

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function ps(script) {
  const temp = path.join(__dirname, '_kb_temp.ps1');
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

const Keyboard = {
  // Type text string
  type(text) {
    const escaped = text
      .replace(/[+^%~(){}[\]]/g, '{$&}')
      .replace(/\n/g, '{ENTER}')
      .replace(/\t/g, '{TAB}');
    
    ps(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${escaped.replace(/'/g, "''")}')
`);
    console.log(`⌨️ Typed: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
  },

  // Press special key
  press(key) {
    const keyMap = {
      'enter': '{ENTER}',
      'tab': '{TAB}',
      'escape': '{ESC}',
      'esc': '{ESC}',
      'backspace': '{BACKSPACE}',
      'delete': '{DELETE}',
      'up': '{UP}',
      'down': '{DOWN}',
      'left': '{LEFT}',
      'right': '{RIGHT}',
      'home': '{HOME}',
      'end': '{END}',
      'pageup': '{PGUP}',
      'pagedown': '{PGDN}',
      'f1': '{F1}', 'f2': '{F2}', 'f3': '{F3}', 'f4': '{F4}',
      'f5': '{F5}', 'f6': '{F6}', 'f7': '{F7}', 'f8': '{F8}',
      'f9': '{F9}', 'f10': '{F10}', 'f11': '{F11}', 'f12': '{F12}',
      'space': ' ',
    };
    
    const sendKey = keyMap[key.toLowerCase()] || key;
    ps(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${sendKey}')
`);
    console.log(`⌨️ Pressed: ${key}`);
  },

  // Keyboard shortcut (e.g., ctrl+c, alt+tab)
  shortcut(combo) {
    const parts = combo.toLowerCase().split('+');
    let sendStr = '';
    
    for (const part of parts) {
      switch (part.trim()) {
        case 'ctrl': sendStr += '^'; break;
        case 'alt': sendStr += '%'; break;
        case 'shift': sendStr += '+'; break;
        default: sendStr += part.trim();
      }
    }
    
    ps(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${sendStr}')
`);
    console.log(`⌨️ Shortcut: ${combo}`);
  }
};

// CLI
const [,, cmd, ...args] = process.argv;

if (cmd) {
  console.log('⌨️ D0T Keyboard\n');
  
  switch (cmd) {
    case 'type':
      Keyboard.type(args.join(' '));
      break;
    case 'press':
      Keyboard.press(args[0]);
      break;
    case 'shortcut':
      Keyboard.shortcut(args[0]);
      break;
    default:
      console.log(`Commands:
  type <text>      Type text
  press <key>      Press key (enter, tab, esc, f1-f12, etc)
  shortcut <combo> Key combo (ctrl+c, alt+tab, ctrl+shift+p)
`);
  }
}

module.exports = { Keyboard };
