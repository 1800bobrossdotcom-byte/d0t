/**
 * B0B VISION CORE
 * ══════════════════════════════════════════════════════════════
 * 
 * Unified vision system for B0B's autonomous agents
 * 
 * Used by:
 *   - D0T (ghost.js)     → Screen reading, UI automation
 *   - 0TYPE              → Letterform recognition, inspiration parsing
 *   - Trading bots       → Chart pattern recognition
 * 
 * The same OCR/vision pipeline serves all B0B projects.
 * Improvements here improve everything.
 */

const Tesseract = require('tesseract.js');
const path = require('path');
const fs = require('fs');

// ══════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════

const CONFIG = {
  // OCR settings
  language: 'eng',
  
  // Caching
  cacheWorker: true,
  
  // Pattern libraries for different domains
  domains: {
    ui: {
      // VS Code / browser UI patterns
      buttons: ['Continue', 'Allow', 'Keep', 'Skip', 'Cancel', 'OK', 'Yes', 'No', 'Run', 'Save'],
      actions: ['Click', 'Open', 'Close', 'Submit'],
    },
    typography: {
      // Letterform patterns
      uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
      lowercase: 'abcdefghijklmnopqrstuvwxyz'.split(''),
      numbers: '0123456789'.split(''),
      punctuation: '.,;:!?\'"-()[]{}/@#$%&*'.split(''),
    },
    trading: {
      // Chart patterns (future)
      signals: ['buy', 'sell', 'hold', 'long', 'short'],
      patterns: ['head-shoulders', 'double-top', 'flag', 'wedge'],
    },
  },
};

// ══════════════════════════════════════════════════════════════
// WORKER MANAGEMENT
// ══════════════════════════════════════════════════════════════

let worker = null;

async function getWorker() {
  if (!worker) {
    worker = await Tesseract.createWorker(CONFIG.language);
  }
  return worker;
}

async function terminateWorker() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}

// ══════════════════════════════════════════════════════════════
// CORE OCR
// ══════════════════════════════════════════════════════════════

/**
 * Read text from an image
 * @param {string} imagePath - Path to image file
 * @param {object} options - OCR options
 * @returns {Promise<{text: string, words: array, confidence: number}>}
 */
async function read(imagePath, options = {}) {
  const startTime = Date.now();
  
  try {
    const { data } = await Tesseract.recognize(imagePath, CONFIG.language, {
      logger: options.verbose ? (m) => console.log(m) : () => {},
    });
    
    const words = (data.words || []).map(w => ({
      text: w.text,
      x: Math.round(w.bbox.x0 + (w.bbox.x1 - w.bbox.x0) / 2),
      y: Math.round(w.bbox.y0 + (w.bbox.y1 - w.bbox.y0) / 2),
      width: w.bbox.x1 - w.bbox.x0,
      height: w.bbox.y1 - w.bbox.y0,
      confidence: w.confidence / 100,
      bbox: w.bbox,
    }));
    
    return {
      text: data.text,
      words,
      confidence: data.confidence / 100,
      timing: Date.now() - startTime,
    };
  } catch (err) {
    return {
      text: '',
      words: [],
      confidence: 0,
      timing: Date.now() - startTime,
      error: err.message,
    };
  }
}

// ══════════════════════════════════════════════════════════════
// PATTERN FINDING
// ══════════════════════════════════════════════════════════════

/**
 * Find specific text patterns in OCR results
 * @param {object} ocrResult - Result from read()
 * @param {string[]} patterns - Text patterns to find
 * @param {object} options - Search options
 * @returns {array} Found patterns with positions
 */
function findPatterns(ocrResult, patterns, options = {}) {
  const { caseSensitive = false, minConfidence = 0.6 } = options;
  const found = [];
  
  for (const pattern of patterns) {
    const regex = new RegExp(caseSensitive ? pattern : pattern, 'i');
    
    for (const word of ocrResult.words) {
      if (word.confidence >= minConfidence && regex.test(word.text)) {
        found.push({
          pattern,
          match: word.text,
          x: word.x,
          y: word.y,
          confidence: word.confidence,
          bbox: word.bbox,
        });
      }
    }
  }
  
  // Sort by confidence
  found.sort((a, b) => b.confidence - a.confidence);
  
  return found;
}

/**
 * Find UI elements (buttons, links, etc.)
 * Optimized for D0T ghost mode
 */
function findUIElements(ocrResult) {
  return findPatterns(ocrResult, CONFIG.domains.ui.buttons, {
    minConfidence: 0.3,  // Lower threshold - screen buttons often have lower OCR confidence
  });
}

/**
 * Find letterforms in image
 * Optimized for 0TYPE glyph recognition
 */
function findLetterforms(ocrResult, options = {}) {
  const { type = 'all' } = options;
  let patterns = [];
  
  if (type === 'all' || type === 'uppercase') {
    patterns = patterns.concat(CONFIG.domains.typography.uppercase);
  }
  if (type === 'all' || type === 'lowercase') {
    patterns = patterns.concat(CONFIG.domains.typography.lowercase);
  }
  if (type === 'all' || type === 'numbers') {
    patterns = patterns.concat(CONFIG.domains.typography.numbers);
  }
  
  return findPatterns(ocrResult, patterns, {
    caseSensitive: true,
    minConfidence: 0.5,
  });
}

// ══════════════════════════════════════════════════════════════
// SPECIALIZED READERS
// ══════════════════════════════════════════════════════════════

/**
 * Read screen for UI automation (D0T)
 */
async function readScreen(imagePath) {
  const result = await read(imagePath);
  const uiElements = findUIElements(result);
  
  return {
    ...result,
    uiElements,
    hasActionableButton: uiElements.length > 0,
    bestAction: uiElements[0] || null,
  };
}

/**
 * Read inspiration image for letterforms (0TYPE)
 */
async function readInspiration(imagePath) {
  const result = await read(imagePath);
  const letterforms = findLetterforms(result);
  
  // Group by character
  const glyphs = {};
  for (const lf of letterforms) {
    const char = lf.match.toUpperCase();
    if (!glyphs[char]) glyphs[char] = [];
    glyphs[char].push(lf);
  }
  
  return {
    ...result,
    letterforms,
    glyphs,
    uniqueChars: Object.keys(glyphs),
  };
}

/**
 * Read chart for patterns (Trading - future)
 */
async function readChart(imagePath) {
  // Future: integrate with chart pattern recognition
  const result = await read(imagePath);
  
  return {
    ...result,
    // Chart-specific analysis would go here
    signals: [],
    patterns: [],
  };
}

// ══════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════

module.exports = {
  // Core
  read,
  findPatterns,
  
  // Domain-specific
  readScreen,        // D0T
  readInspiration,   // 0TYPE
  readChart,         // Trading
  
  // UI helpers
  findUIElements,
  findLetterforms,
  
  // Worker management
  getWorker,
  terminateWorker,
  
  // Config
  CONFIG,
};

// ══════════════════════════════════════════════════════════════
// CLI
// ══════════════════════════════════════════════════════════════

if (require.main === module) {
  const [,, mode, imagePath] = process.argv;
  
  const run = async () => {
    const img = imagePath || 'screenshot.png';
    
    console.log(`🔮 B0B Vision Core\n`);
    console.log(`Mode: ${mode || 'screen'}`);
    console.log(`Image: ${img}\n`);
    
    let result;
    
    switch (mode) {
      case 'type':
      case '0type':
        result = await readInspiration(img);
        console.log(`Found ${result.letterforms.length} letterforms:`);
        console.log(`Unique chars: ${result.uniqueChars.join(', ')}`);
        break;
        
      case 'chart':
      case 'trade':
        result = await readChart(img);
        console.log('Chart analysis (coming soon)');
        break;
        
      case 'screen':
      default:
        result = await readScreen(img);
        console.log(`UI Elements found: ${result.uiElements.length}`);
        if (result.bestAction) {
          console.log(`Best action: Click "${result.bestAction.match}" at (${result.bestAction.x}, ${result.bestAction.y})`);
        }
        break;
    }
    
    console.log(`\nTiming: ${result.timing}ms`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  };
  
  run().catch(console.error);
}
