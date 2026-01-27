// D0T Vision - OCR for screenshots
// Lets b0b "see" what's on screen

const Tesseract = require('tesseract.js');
const path = require('path');

async function see(imagePath) {
  console.log(`👁️ Analyzing: ${imagePath}\n`);
  
  const { data } = await Tesseract.recognize(imagePath, 'eng', {
    logger: m => {
      if (m.status === 'recognizing text') {
        process.stdout.write(`\r   Progress: ${(m.progress * 100).toFixed(0)}%`);
      }
    }
  });
  
  console.log('\n\n📝 TEXT FOUND:\n');
  console.log('─'.repeat(50));
  console.log(data.text);
  console.log('─'.repeat(50));
  
  // Also output word positions for clicking
  console.log('\n🎯 CLICKABLE WORDS (with positions):');
  const words = data.words || [];
  const clickable = words
    .filter(w => w.confidence > 80 && w.text.length > 2)
    .slice(0, 20)
    .map(w => ({
      text: w.text,
      x: Math.round(w.bbox.x0 + (w.bbox.x1 - w.bbox.x0) / 2),
      y: Math.round(w.bbox.y0 + (w.bbox.y1 - w.bbox.y0) / 2),
      confidence: w.confidence.toFixed(0)
    }));
  
  clickable.forEach(w => {
    console.log(`   "${w.text}" → (${w.x}, ${w.y})`);
  });
  
  return { text: data.text, words: clickable };
}

// CLI
const imagePath = process.argv[2] || 'screenshot.png';
see(path.resolve(imagePath)).catch(console.error);
