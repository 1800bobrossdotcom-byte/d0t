Add-Type -AssemblyName System.Windows.Forms
$text = $args[0]
[System.Windows.Forms.SendKeys]::SendWait($text)
Write-Host "Typed: $text"
