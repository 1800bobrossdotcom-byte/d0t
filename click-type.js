// D0T Click and Type - Simple version
const { exec } = require('child_process');

async function run() {
  const x = parseInt(process.argv[2]) || 960;
  const y = parseInt(process.argv[3]) || 500;
  const text = process.argv.slice(4).join(' ') || 'D0T';
  
  console.log(`🖱️ Moving to (${x}, ${y})...`);
  
  // Move mouse
  await new Promise((resolve, reject) => {
    exec(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})"`, 
      (err) => err ? reject(err) : resolve());
  });
  
  await new Promise(r => setTimeout(r, 100));
  console.log(`🖱️ Clicking...`);
  
  // Click
  await new Promise((resolve, reject) => {
    const clickPs = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Mouse {
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    public static void Click() {
        mouse_event(0x0002, 0, 0, 0, 0);
        System.Threading.Thread.Sleep(50);
        mouse_event(0x0004, 0, 0, 0, 0);
    }
}
"@
[Mouse]::Click()
`;
    exec(`powershell -Command "${clickPs.replace(/\r?\n/g, ' ').replace(/"/g, '\\"')}"`,
      (err) => err ? reject(err) : resolve());
  });
  
  await new Promise(r => setTimeout(r, 200));
  console.log(`⌨️ Typing: "${text}"`);
  
  // Type
  await new Promise((resolve, reject) => {
    const escaped = text.replace(/[+^%~(){}[\]]/g, '{$&}');
    exec(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')"`,
      (err) => err ? reject(err) : resolve());
  });
  
  console.log(`✅ Done!`);
}

run().catch(console.error);
