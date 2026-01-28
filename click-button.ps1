# Find and click a button by text using UI Automation
param(
    [Parameter(Mandatory=$true)]
    [string]$ButtonText
)

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

# Get automation element for desktop
$desktop = [System.Windows.Automation.AutomationElement]::RootElement

# Find all buttons
$buttonCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button
)

$buttons = $desktop.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)

foreach ($button in $buttons) {
    $name = $button.Current.Name
    if ($name -match $ButtonText) {
        # Get bounding rectangle
        $rect = $button.Current.BoundingRectangle
        $x = [int]($rect.Left + $rect.Width / 2)
        $y = [int]($rect.Top + $rect.Height / 2)
        
        Write-Host "Found '$name' at ($x, $y)"
        
        # Move mouse and click
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y)
        Start-Sleep -Milliseconds 100
        
        # Click using mouse_event
        Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MouseClick {
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
}
"@
        [MouseClick]::mouse_event(0x0002, 0, 0, 0, 0)  # Left down
        Start-Sleep -Milliseconds 50
        [MouseClick]::mouse_event(0x0004, 0, 0, 0, 0)  # Left up
        
        Write-Host "Clicked '$name' at ($x, $y)"
        exit 0
    }
}

Write-Host "Button '$ButtonText' not found"
exit 1
