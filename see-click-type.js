// D0T See-Click-Type - Full interaction loop
const { exec } = require('child_process');

// Take a screenshot
function screenshot(path = 'c:\\workspace\\b0b-platform\\d0t\\screenshot.png') {
  return new Promise((resolve, reject) => {
    const ps = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
      $bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
      $bitmap.Save('${path.replace(/\\/g, '\\\\')}')
      $graphics.Dispose()
      $bitmap.Dispose()
    `;
    exec(`powershell -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve(path);
    });
  });
}

// Move mouse to position
function moveTo(x, y) {
  return new Promise((resolve, reject) => {
    const ps = `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})
    `;
    exec(`powershell -Command "${ps.replace(/\n/g, '; ')}"`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Click at current position
function click() {
  return new Promise((resolve, reject) => {
    const ps = `
      $signature = @'
      [DllImport("user32.dll")]
      public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
'@
      $mouse = Add-Type -MemberDefinition $signature -Name "MouseClick" -Namespace "Win32" -PassThru
      $mouse::mouse_event(0x0002, 0, 0, 0, 0)
      Start-Sleep -Milliseconds 50
      $mouse::mouse_event(0x0004, 0, 0, 0, 0)
    `;
    exec(`powershell -Command "${ps.replace(/'/g, "''").replace(/\n/g, '; ')}"`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Type text into focused window
function type(text) {
  return new Promise((resolve, reject) => {
    const escaped = text.replace(/'/g, "''");
    const ps = `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait('${escaped}')
    `;
    exec(`powershell -Command "${ps.replace(/\n/g, '; ')}"`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Main: Click on coordinates, then type
async function clickAndType(x, y, text) {
  console.log(`🖱️ Moving to (${x}, ${y})...`);
  await moveTo(x, y);
  await new Promise(r => setTimeout(r, 100));
  
  console.log(`🖱️ Clicking...`);
  await click();
  await new Promise(r => setTimeout(r, 200));
  
  console.log(`⌨️ Typing: "${text}"`);
  await type(text);
  
  console.log(`✅ Done!`);
}

// CLI
const args = process.argv.slice(2);
if (args[0] === 'screenshot') {
  screenshot().then(p => console.log(`📸 Saved: ${p}`));
} else if (args[0] === 'click-type' && args.length >= 4) {
  const x = parseInt(args[1]);
  const y = parseInt(args[2]);
  const text = args.slice(3).join(' ');
  clickAndType(x, y, text);
} else {
  console.log(`
D0T See-Click-Type

Usage:
  node see-click-type.js screenshot          - Take a screenshot
  node see-click-type.js click-type X Y text - Click at X,Y then type text

Example:
  node see-click-type.js click-type 500 300 "Hello D0T!"
  `);
}
