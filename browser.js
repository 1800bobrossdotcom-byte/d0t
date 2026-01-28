#!/usr/bin/env node
/**
 * D0T Browser Control - Chrome DevTools Protocol
 * ══════════════════════════════════════════════════════════════
 * 
 * Inspired by moltbot's browser control:
 * - Connect to Chrome via CDP for precise automation
 * - No need for OCR on web pages - use DOM directly
 * - Screenshot capture with element highlighting
 * - JavaScript execution in page context
 * 
 * Requirements:
 *   Chrome must be running with remote debugging:
 *   chrome.exe --remote-debugging-port=9222
 * 
 * Usage:
 *   const browser = require('./browser');
 *   await browser.connect();
 *   await browser.goto('https://example.com');
 *   await browser.click('#button');
 *   await browser.type('#input', 'Hello');
 */

const http = require('http');
const WebSocket = require('ws');

// ══════════════════════════════════════════════════════════════
// CDP CLIENT
// ══════════════════════════════════════════════════════════════

class D0TBrowser {
  constructor(debugPort = 9222) {
    this.debugPort = debugPort;
    this.ws = null;
    this.messageId = 1;
    this.callbacks = new Map();
    this.pageTarget = null;
  }

  // ═══════════════════════════════════════════════════════════
  // CONNECTION
  // ═══════════════════════════════════════════════════════════

  async connect() {
    // Get list of targets (pages/tabs)
    const targets = await this.getTargets();
    
    // Find a page target (not extension, devtools, etc)
    this.pageTarget = targets.find(t => t.type === 'page');
    
    if (!this.pageTarget) {
      throw new Error('No browser page found. Is Chrome running with --remote-debugging-port=9222?');
    }

    // Connect WebSocket to the page
    return new Promise((resolve, reject) => {
      const wsUrl = this.pageTarget.webSocketDebuggerUrl;
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log('✅ Connected to Chrome CDP');
        resolve();
      });

      this.ws.on('message', (data) => {
        const msg = JSON.parse(data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      });

      this.ws.on('error', reject);
      this.ws.on('close', () => console.log('❌ CDP connection closed'));
    });
  }

  getTargets() {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${this.debugPort}/json`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Failed to parse targets: ' + e.message));
          }
        });
      }).on('error', (e) => {
        reject(new Error(`Chrome not found on port ${this.debugPort}. Start with: chrome --remote-debugging-port=9222`));
      });
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.messageId++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // ═══════════════════════════════════════════════════════════
  // NAVIGATION
  // ═══════════════════════════════════════════════════════════

  async goto(url) {
    // Enable Page domain for navigation events
    await this.send('Page.enable');
    
    const result = await this.send('Page.navigate', { url });
    console.log(`🌐 Navigate to: ${url}`);
    
    // Wait for page load
    await this.waitForLoad();
    return result;
  }

  async waitForLoad(timeout = 30000) {
    // Wait for load event using Runtime.evaluate
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      const result = await this.evaluate('document.readyState');
      if (result === 'complete') return;
      await this.sleep(100);
    }
    
    throw new Error('Page load timeout');
  }

  async getUrl() {
    return this.evaluate('window.location.href');
  }

  async getTitle() {
    return this.evaluate('document.title');
  }

  // ═══════════════════════════════════════════════════════════
  // DOM INTERACTION
  // ═══════════════════════════════════════════════════════════

  async click(selector) {
    // Click using DOM
    const clicked = await this.evaluate(`
      (function() {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!el) return false;
        el.click();
        return true;
      })()
    `);
    
    if (!clicked) {
      throw new Error(`Element not found: ${selector}`);
    }
    
    console.log(`🖱️ Click: ${selector}`);
    return true;
  }

  async clickText(text) {
    // Click element containing specific text
    const clicked = await this.evaluate(`
      (function() {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );
        
        let node;
        while (node = walker.nextNode()) {
          if (node.textContent.trim().includes('${text.replace(/'/g, "\\'")}')) {
            const el = node.parentElement;
            if (el && el.click) {
              el.click();
              return true;
            }
          }
        }
        
        // Fallback: find button/link with this text
        const buttons = document.querySelectorAll('button, a, [role="button"]');
        for (const btn of buttons) {
          if (btn.textContent.trim().includes('${text.replace(/'/g, "\\'")}')) {
            btn.click();
            return true;
          }
        }
        
        return false;
      })()
    `);
    
    if (!clicked) {
      throw new Error(`Text not found: ${text}`);
    }
    
    console.log(`🖱️ Click text: "${text}"`);
    return true;
  }

  async type(selector, text) {
    // Focus and type using Input.insertText (more reliable)
    await this.click(selector);
    await this.sleep(50);
    
    // Use Input domain for proper typing
    await this.send('Input.insertText', { text });
    
    console.log(`⌨️ Type in ${selector}: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
    return true;
  }

  async typeKeys(text) {
    // Type without a specific element (wherever focus is)
    await this.send('Input.insertText', { text });
    console.log(`⌨️ Type: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
  }

  async press(key) {
    // Press a specific key
    const keyCode = {
      'Enter': 13, 'Tab': 9, 'Escape': 27, 'Backspace': 8,
      'ArrowUp': 38, 'ArrowDown': 40, 'ArrowLeft': 37, 'ArrowRight': 39,
    }[key] || 0;
    
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code: key,
      windowsVirtualKeyCode: keyCode,
    });
    
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code: key,
      windowsVirtualKeyCode: keyCode,
    });
    
    console.log(`⌨️ Press: ${key}`);
  }

  async hotkey(combo) {
    // e.g., 'ctrl+l', 'ctrl+shift+n'
    const parts = combo.toLowerCase().split('+');
    const key = parts.pop();
    const modifiers = parts;
    
    let modifierMask = 0;
    if (modifiers.includes('ctrl')) modifierMask |= 2;
    if (modifiers.includes('alt')) modifierMask |= 1;
    if (modifiers.includes('shift')) modifierMask |= 8;
    if (modifiers.includes('meta') || modifiers.includes('cmd')) modifierMask |= 4;
    
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code: `Key${key.toUpperCase()}`,
      modifiers: modifierMask,
    });
    
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code: `Key${key.toUpperCase()}`,
      modifiers: modifierMask,
    });
    
    console.log(`⌨️ Hotkey: ${combo}`);
  }

  // ═══════════════════════════════════════════════════════════
  // JAVASCRIPT EXECUTION
  // ═══════════════════════════════════════════════════════════

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
    });
    
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text);
    }
    
    return result.result.value;
  }

  async evaluateAsync(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text);
    }
    
    return result.result.value;
  }

  // ═══════════════════════════════════════════════════════════
  // INFORMATION
  // ═══════════════════════════════════════════════════════════

  async getText(selector) {
    return this.evaluate(`
      document.querySelector('${selector.replace(/'/g, "\\'")}')?.textContent || ''
    `);
  }

  async getHTML(selector) {
    return this.evaluate(`
      document.querySelector('${selector.replace(/'/g, "\\'")}')?.innerHTML || ''
    `);
  }

  async exists(selector) {
    return this.evaluate(`
      !!document.querySelector('${selector.replace(/'/g, "\\'")}')
    `);
  }

  async findAll(selector) {
    return this.evaluate(`
      Array.from(document.querySelectorAll('${selector.replace(/'/g, "\\'")}'))
        .map(el => ({
          tag: el.tagName.toLowerCase(),
          text: el.textContent.substring(0, 100),
          id: el.id,
          className: el.className,
        }))
    `);
  }

  async getPageInfo() {
    return this.evaluate(`
      ({
        url: window.location.href,
        title: document.title,
        buttons: Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]'))
          .map(b => b.textContent.trim()).filter(t => t).slice(0, 20),
        links: Array.from(document.querySelectorAll('a[href]'))
          .map(a => ({ text: a.textContent.trim().substring(0, 50), href: a.href }))
          .filter(l => l.text).slice(0, 20),
        inputs: Array.from(document.querySelectorAll('input, textarea, select'))
          .map(i => ({ type: i.type, name: i.name, id: i.id, placeholder: i.placeholder }))
          .slice(0, 20),
      })
    `);
  }

  // ═══════════════════════════════════════════════════════════
  // SCREENSHOT
  // ═══════════════════════════════════════════════════════════

  async screenshot(format = 'png') {
    const result = await this.send('Page.captureScreenshot', {
      format,
      quality: format === 'jpeg' ? 80 : undefined,
    });
    
    return Buffer.from(result.data, 'base64');
  }

  async screenshotToFile(filepath) {
    const data = await this.screenshot();
    require('fs').writeFileSync(filepath, data);
    console.log(`📸 Screenshot saved: ${filepath}`);
    return filepath;
  }

  // ═══════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════

  sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// ══════════════════════════════════════════════════════════════
// CLI INTERFACE
// ══════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  
  if (!cmd || cmd === '--help') {
    console.log(`
🌐 D0T Browser Control - Chrome DevTools Protocol

First, start Chrome with:
  chrome --remote-debugging-port=9222

Commands:
  node browser.js connect           - Test CDP connection
  node browser.js goto <url>        - Navigate to URL
  node browser.js click <selector>  - Click element by CSS selector
  node browser.js clickText <text>  - Click element containing text
  node browser.js type <sel> <text> - Type in element
  node browser.js info              - Get page info (buttons, links, etc)
  node browser.js screenshot        - Take screenshot
  node browser.js eval <js>         - Evaluate JavaScript
    `);
    return;
  }
  
  const browser = new D0TBrowser();
  
  try {
    await browser.connect();
    
    switch (cmd) {
      case 'connect':
        console.log('✅ Connected!');
        console.log('📄 Page:', await browser.getUrl());
        console.log('📋 Title:', await browser.getTitle());
        break;
        
      case 'goto':
        await browser.goto(args[1]);
        break;
        
      case 'click':
        await browser.click(args[1]);
        break;
        
      case 'clickText':
        await browser.clickText(args.slice(1).join(' '));
        break;
        
      case 'type':
        await browser.type(args[1], args.slice(2).join(' '));
        break;
        
      case 'info':
        const info = await browser.getPageInfo();
        console.log('\n📄 Page Info:');
        console.log(`URL: ${info.url}`);
        console.log(`Title: ${info.title}`);
        console.log(`\n🔘 Buttons: ${info.buttons.join(', ')}`);
        console.log(`\n🔗 Links: ${info.links.map(l => l.text).slice(0, 10).join(', ')}`);
        console.log(`\n📝 Inputs: ${info.inputs.map(i => i.name || i.id || i.type).join(', ')}`);
        break;
        
      case 'screenshot':
        await browser.screenshotToFile('browser-screenshot.png');
        break;
        
      case 'eval':
        const result = await browser.evaluate(args.slice(1).join(' '));
        console.log(result);
        break;
        
      default:
        console.log('Unknown command:', cmd);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = D0TBrowser;
