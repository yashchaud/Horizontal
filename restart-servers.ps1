# Restart MediaSoup Servers
Write-Host "Restarting MediaSoup servers..." -ForegroundColor Cyan

# Stop any existing node processes
Write-Host "Stopping existing node processes..." -ForegroundColor Yellow
$nodePids = Get-Process -Name "node" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id
if ($nodePids) {
    $nodePids | ForEach-Object { Stop-Process -Id $_ -Force }
    Write-Host "Stopped $($nodePids.Count) node processes" -ForegroundColor Green
} else {
    Write-Host "No node processes found" -ForegroundColor Green
}

# Clear the logs directory
Write-Host "Clearing logs directory..." -ForegroundColor Yellow
if (Test-Path "logs") {
    Get-ChildItem -Path "logs" -File | Where-Object { $_.Name -match '\.log$' } | Remove-Item -Force
    Write-Host "Logs cleared" -ForegroundColor Green
} else {
    New-Item -ItemType Directory -Path "logs" | Out-Null
    Write-Host "Created logs directory" -ForegroundColor Green
}

# Start the servers
Write-Host "Starting servers with fixed code..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-File ./run-servers.ps1" -WindowStyle Normal

Write-Host "Servers restart initiated. Check the new PowerShell windows for output." -ForegroundColor Cyan
Write-Host "Wait a moment for servers to start, then try connecting with clients again." -ForegroundColor Cyan 