// D0T Agent - Unified See→Think→Act Loop
const { exec, spawn } = require('child_process');
const { createWorker } = require('tesseract.js');
const path = require('path');

const SCREENSHOT_PATH = path.join(__dirname, 'screenshot.png');

class D0TAgent {
  constructor() {
    this.lastScreen = null;
    this.lastWords = [];
    this.lastText = '';
    this.actionQueue = [];
    this.worker = null;
  }

  async init() {
    if (!this.worker) {
      console.log('🔧 Initializing OCR worker...');
      this.worker = await createWorker('eng');
      console.log('✅ OCR ready');
    }
  }

  async cleanup() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // VISION - Fast screenshot + OCR with word positions
  // ═══════════════════════════════════════════════════════════════
  
  async see() {
    const start = Date.now();
    
    // Ensure worker is ready
    await this.init();
    
    // Take screenshot
    await this.screenshot();
    console.log(`📸 Screenshot: ${Date.now() - start}ms`);
    
    // OCR - get text and estimate positions from lines
    const ocrStart = Date.now();
    const { data } = await this.worker.recognize(SCREENSHOT_PATH);
    
    this.lastText = data.text || '';
    
    // Parse text into words with estimated positions
    // Screen is ~1920x1080, estimate 100 chars per line, ~30 lines
    const lines = this.lastText.split('\n');
    this.lastWords = [];
    
    const lineHeight = 30; // Approximate pixels per line
    const charWidth = 8;   // Approximate pixels per character
    
    lines.forEach((line, lineIdx) => {
      const y = 50 + lineIdx * lineHeight; // Start ~50px from top
      let x = 50; // Start ~50px from left
      
      const words = line.split(/\s+/).filter(w => w.length > 0);
      words.forEach(word => {
        this.lastWords.push({
          text: word,
          x: x + (word.length * charWidth) / 2,
          y: y,
          lineIdx
        });
        x += word.length * charWidth + 10; // Word width + space
      });
    });
    
    console.log(`👁️ OCR: ${Date.now() - ocrStart}ms (${this.lastWords.length} words)`);
    
    return this.lastWords;
  }

  // Remove parseHOCR - not needed with this approach

  screenshot() {
    return new Promise((resolve, reject) => {
      exec(`powershell -ExecutionPolicy Bypass -File "${path.join(__dirname, 'screenshot.ps1')}"`,
        (err) => err ? reject(err) : resolve());
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // FIND - Locate elements on screen by text
  // ═══════════════════════════════════════════════════════════════
  
  find(text, options = {}) {
    const { exact = false, near = null } = options;
    const search = text.toLowerCase();
    
    let matches = this.lastWords.filter(w => {
      const wordText = w.text.toLowerCase();
      return exact ? wordText === search : wordText.includes(search);
    });
    
    // If looking for something near another element
    if (near && matches.length > 0) {
      const nearEl = this.find(near)[0];
      if (nearEl) {
        matches = matches.sort((a, b) => {
          const distA = Math.hypot(a.x - nearEl.x, a.y - nearEl.y);
          const distB = Math.hypot(b.x - nearEl.x, b.y - nearEl.y);
          return distA - distB;
        });
      }
    }
    
    return matches;
  }

  findAll(patterns) {
    const results = {};
    for (const pattern of patterns) {
      results[pattern] = this.find(pattern);
    }
    return results;
  }

  // ═══════════════════════════════════════════════════════════════
  // ACTIONS - Click, Type, Press (batched for speed)
  // ═══════════════════════════════════════════════════════════════
  
  async click(x, y) {
    const start = Date.now();
    await this.runPS(`
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Mouse {
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
}
"@
      [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})
      Start-Sleep -Milliseconds 50
      [Mouse]::mouse_event(0x0002, 0, 0, 0, 0)
      Start-Sleep -Milliseconds 30
      [Mouse]::mouse_event(0x0004, 0, 0, 0, 0)
    `);
    console.log(`🖱️ Click (${x}, ${y}): ${Date.now() - start}ms`);
  }

  async clickOn(text, options = {}) {
    const matches = this.find(text, options);
    if (matches.length === 0) {
      console.log(`❌ Not found: "${text}"`);
      return false;
    }
    const target = matches[0];
    console.log(`🎯 Found "${text}" at (${target.x}, ${target.y})`);
    await this.click(target.x, target.y);
    return true;
  }

  async type(text) {
    const start = Date.now();
    // Escape special SendKeys characters
    const escaped = text.replace(/[+^%~(){}[\]]/g, '{$&}');
    await this.runPS(`
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait('${escaped.replace(/'/g, "''")}')
    `);
    console.log(`⌨️ Type "${text}": ${Date.now() - start}ms`);
  }

  async press(key) {
    const start = Date.now();
    await this.runPS(`
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait('${key}')
    `);
    console.log(`⌨️ Press ${key}: ${Date.now() - start}ms`);
  }

  async hotkey(keys) {
    // Convert "ctrl+l" to "^l", "alt+f4" to "%{F4}", etc.
    const keyMap = {
      'ctrl': '^', 'alt': '%', 'shift': '+', 'win': '^{ESC}',
      'enter': '{ENTER}', 'tab': '{TAB}', 'esc': '{ESC}', 'escape': '{ESC}',
      'up': '{UP}', 'down': '{DOWN}', 'left': '{LEFT}', 'right': '{RIGHT}',
      'backspace': '{BACKSPACE}', 'delete': '{DELETE}', 'home': '{HOME}', 'end': '{END}',
      'f1': '{F1}', 'f2': '{F2}', 'f3': '{F3}', 'f4': '{F4}', 'f5': '{F5}',
      'f6': '{F6}', 'f7': '{F7}', 'f8': '{F8}', 'f9': '{F9}', 'f10': '{F10}',
      'f11': '{F11}', 'f12': '{F12}'
    };
    
    let sendKeys = '';
    const parts = keys.toLowerCase().split('+');
    for (const part of parts) {
      sendKeys += keyMap[part] || part;
    }
    await this.press(sendKeys);
  }

  // ═══════════════════════════════════════════════════════════════
  // COMPOUND ACTIONS - Common patterns
  // ═══════════════════════════════════════════════════════════════
  
  async focusAndType(x, y, text) {
    await this.click(x, y);
    await this.wait(100);
    await this.type(text);
  }

  async urlBar(url) {
    await this.hotkey('ctrl+l');
    await this.wait(100);
    await this.type(url);
    await this.press('{ENTER}');
  }

  async search(query) {
    await this.hotkey('ctrl+escape'); // Windows search
    await this.wait(300);
    await this.type(query);
    await this.wait(500);
  }

  async searchAndOpen(query) {
    await this.search(query);
    await this.press('{ENTER}');
    await this.wait(1000);
  }

  // ═══════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════
  
  wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  runPS(script) {
    return new Promise((resolve, reject) => {
      const cleaned = script.replace(/\r?\n/g, '\n').trim();
      const tempFile = path.join(__dirname, '_temp.ps1');
      require('fs').writeFileSync(tempFile, cleaned);
      exec(`powershell -ExecutionPolicy Bypass -File "${tempFile}"`,
        (err, stdout, stderr) => {
          try { require('fs').unlinkSync(tempFile); } catch {}
          if (err) reject(err);
          else resolve(stdout);
        });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // ANALYSIS - Understand what's on screen
  // ═══════════════════════════════════════════════════════════════
  
  summarize() {
    if (this.lastWords.length === 0) return 'No words detected';
    
    // Group by rough Y position (lines)
    const lines = {};
    for (const w of this.lastWords) {
      const lineY = Math.round(w.y / 30) * 30; // Group within 30px
      if (!lines[lineY]) lines[lineY] = [];
      lines[lineY].push(w);
    }
    
    // Sort each line by X, then combine
    const sortedLines = Object.keys(lines)
      .map(Number)
      .sort((a, b) => a - b)
      .map(y => lines[y].sort((a, b) => a.x - b.x).map(w => w.text).join(' '));
    
    return sortedLines.slice(0, 10).join('\n'); // First 10 lines
  }

  contains(text) {
    return this.find(text).length > 0;
  }

  // ═══════════════════════════════════════════════════════════════
  // AGENT LOOP - See → Think → Act
  // ═══════════════════════════════════════════════════════════════
  
  async execute(actions) {
    for (const action of actions) {
      console.log(`\n▶️ ${action.type}: ${JSON.stringify(action.params || {})}`);
      
      switch (action.type) {
        case 'see':
          await this.see();
          break;
        case 'click':
          await this.click(action.params.x, action.params.y);
          break;
        case 'clickOn':
          await this.clickOn(action.params.text, action.params);
          break;
        case 'type':
          await this.type(action.params.text);
          break;
        case 'press':
          await this.press(action.params.key);
          break;
        case 'hotkey':
          await this.hotkey(action.params.keys);
          break;
        case 'urlBar':
          await this.urlBar(action.params.url);
          break;
        case 'search':
          await this.search(action.params.query);
          break;
        case 'searchAndOpen':
          await this.searchAndOpen(action.params.query);
          break;
        case 'wait':
          await this.wait(action.params.ms);
          break;
        case 'log':
          console.log(`📝 ${action.params.message}`);
          break;
      }
      
      if (action.wait) await this.wait(action.wait);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// CLI Interface
// ═══════════════════════════════════════════════════════════════

async function main() {
  const agent = new D0TAgent();
  const args = process.argv.slice(2);
  const cmd = args[0];

  switch (cmd) {
    case 'see':
      await agent.see();
      console.log('\n' + agent.summarize());
      break;
      
    case 'find':
      await agent.see();
      const matches = agent.find(args[1]);
      if (matches.length > 0) {
        console.log(`\n🎯 Found "${args[1]}":`);
        matches.slice(0, 5).forEach(m => 
          console.log(`   (${m.x}, ${m.y}) - "${m.text}"`));
      } else {
        console.log(`\n❌ "${args[1]}" not found`);
      }
      break;
      
    case 'click':
      await agent.click(parseInt(args[1]), parseInt(args[2]));
      break;
      
    case 'clickOn':
      await agent.see();
      await agent.clickOn(args[1]);
      break;
      
    case 'type':
      await agent.type(args.slice(1).join(' '));
      break;
      
    case 'url':
      await agent.urlBar(args[1]);
      break;
      
    case 'open':
      await agent.searchAndOpen(args.slice(1).join(' '));
      break;
      
    case 'demo':
      console.log('🤖 D0T Agent Demo\n');
      await agent.see();
      console.log('\n📋 Screen Summary:');
      console.log(agent.summarize());
      
      // Find common UI elements
      const ui = agent.findAll(['Chrome', 'GitHub', 'File', 'Edit', 'View', 'Search']);
      console.log('\n🔍 UI Elements Found:');
      for (const [name, matches] of Object.entries(ui)) {
        if (matches.length > 0) {
          console.log(`   ${name}: (${matches[0].x}, ${matches[0].y})`);
        }
      }
      break;
      
    default:
      console.log(`
🤖 D0T Agent - See → Think → Act

Commands:
  node agent.js see                    - Screenshot + OCR summary
  node agent.js find "text"            - Find text on screen with coordinates
  node agent.js click X Y              - Click at coordinates
  node agent.js clickOn "text"         - Find and click on text
  node agent.js type "text"            - Type text
  node agent.js url "github.com"       - Navigate to URL (Ctrl+L, type, Enter)
  node agent.js open "Chrome"          - Search and open app
  node agent.js demo                   - Full demo with analysis
      `);
  }
}

main().catch(console.error);

module.exports = D0TAgent;
