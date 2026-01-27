Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Mouse {
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
}
"@

$x = $args[0]
$y = $args[1]

# Move
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y)
Start-Sleep -Milliseconds 100

# Click (down then up)
[Mouse]::mouse_event(0x0002, 0, 0, 0, 0)  # Left down
Start-Sleep -Milliseconds 50
[Mouse]::mouse_event(0x0004, 0, 0, 0, 0)  # Left up

Write-Host "Clicked at ($x, $y)"
