Add-Type -AssemblyName System.Windows.Forms
$key = $args[0]
[System.Windows.Forms.SendKeys]::SendWait($key)
Write-Host "Pressed: $key"
