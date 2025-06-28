# PowerShell Script to Run MediaSoup Servers on Different Ports
# Configure these variables as needed

# Server 1 Configuration
$SERVER1_PORT = 3001
$SERVER1_ID = "server-1"
$SERVER1_PUBLIC_IP = "127.0.0.1"  # Change to your actual IP if needed

# Server 2 Configuration
$SERVER2_PORT = 3002
$SERVER2_ID = "server-2"
$SERVER2_PUBLIC_IP = "127.0.0.1"  # Change to your actual IP if needed

# WebSocket Configuration for Inter-Server Communication
$SERVER1_WS_PORT = 8080
$SERVER2_WS_PORT = 8081
$PIPE_REMOTE_ENABLED = "true"  # Set to true to enable piping between servers

# Common Configuration
$INTER_SERVER_SECRET = "supersecret"
$SSL_KEY_PATH = "./backend/mediasoupServer/sslcert/key.pem"
$SSL_CERT_PATH = "./backend/mediasoupServer/sslcert/cert.pem"
$CORS_ORIGIN = "https://localhost:5173"  # Frontend URL, adjust as needed
$DEBUG_LEVEL = "mediasoup*,socket.io*"

# Create log directory if it doesn't exist
if (-not (Test-Path -Path "logs")) {
    New-Item -ItemType Directory -Path "logs"
}

# Display config information
Write-Host "=== WebRTC Dual Server Setup ===" -ForegroundColor Cyan
Write-Host "Setting up Server 1 ($SERVER1_ID)" -ForegroundColor Green
Write-Host "Port: $SERVER1_PORT"
Write-Host "Public IP: $SERVER1_PUBLIC_IP"
Write-Host "WebSocket Port: $SERVER1_WS_PORT"
Write-Host "Remote Server: $SERVER2_ID@$SERVER2_PUBLIC_IP port $SERVER2_PORT"
Write-Host ("Remote WebSocket: ws://{0}:{1}" -f $SERVER2_PUBLIC_IP, $SERVER2_WS_PORT)

Write-Host "Setting up Server 2 ($SERVER2_ID)" -ForegroundColor Green
Write-Host "Port: $SERVER2_PORT"
Write-Host "Public IP: $SERVER2_PUBLIC_IP"
Write-Host "WebSocket Port: $SERVER2_WS_PORT"
Write-Host "Remote Server: $SERVER1_ID@$SERVER1_PUBLIC_IP port $SERVER1_PORT"
Write-Host ("Remote WebSocket: ws://{0}:{1}" -f $SERVER1_PUBLIC_IP, $SERVER1_WS_PORT)

# Create URL strings that won't cause parsing issues
$SERVER1_REMOTE_URL = "https://{0}:{1}" -f $SERVER2_PUBLIC_IP, $SERVER2_PORT
$SERVER2_REMOTE_URL = "https://{0}:{1}" -f $SERVER1_PUBLIC_IP, $SERVER1_PORT
$SERVER1_REMOTE_WS_URL = "ws://{0}:{1}" -f $SERVER2_PUBLIC_IP, $SERVER2_WS_PORT
$SERVER2_REMOTE_WS_URL = "ws://{0}:{1}" -f $SERVER1_PUBLIC_IP, $SERVER1_WS_PORT

# Start Server 1 in a new window
Write-Host "Starting Server 1..." -ForegroundColor Cyan
$server1Args = @"
    `$env:SERVER_ID = '$SERVER1_ID'
    `$env:PORT = $SERVER1_PORT
    `$env:PUBLIC_IP = '$SERVER1_PUBLIC_IP'
    `$env:REMOTE_SERVER_ID = '$SERVER2_ID'
    `$env:REMOTE_SERVER_URL = '$SERVER1_REMOTE_URL'
    `$env:INTER_SERVER_SECRET = '$INTER_SERVER_SECRET'
    `$env:SSL_KEY_PATH = '$SSL_KEY_PATH'
    `$env:SSL_CERT_PATH = '$SSL_CERT_PATH'
    `$env:CORS_ORIGIN = '$CORS_ORIGIN'
    `$env:DEBUG = '$DEBUG_LEVEL'
    # WebSocket piping configuration
    `$env:WS_SERVER_PORT = $SERVER1_WS_PORT
    `$env:TARGET_SERVER_WS_URL = '$SERVER1_REMOTE_WS_URL'
    `$env:TARGET_SERVER_ID = '$SERVER2_ID'
    `$env:PIPE_REMOTE_ENABLED = '$PIPE_REMOTE_ENABLED'
    cd '$PSScriptRoot'
    Write-Host 'Server 1 starting with PORT=' `$env:PORT ' and WS_PORT=' `$env:WS_SERVER_PORT -ForegroundColor Green
    npx nodemon backend/mediasoupServer/index.js | Tee-Object -FilePath 'logs/server1.log'
    Read-Host 'Press Enter to close this window'
"@
Start-Process powershell -ArgumentList $server1Args -WindowStyle Normal

# Wait before starting Server 2
Write-Host "Waiting 5 seconds before starting Server 2..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Start Server 2 in a new window
Write-Host "Starting Server 2..." -ForegroundColor Cyan
$server2Args = @"
    `$env:SERVER_ID = '$SERVER2_ID'
    `$env:PORT = $SERVER2_PORT
    `$env:PUBLIC_IP = '$SERVER2_PUBLIC_IP'
    `$env:REMOTE_SERVER_ID = '$SERVER1_ID'
    `$env:REMOTE_SERVER_URL = '$SERVER2_REMOTE_URL'
    `$env:INTER_SERVER_SECRET = '$INTER_SERVER_SECRET'
    `$env:SSL_KEY_PATH = '$SSL_KEY_PATH'
    `$env:SSL_CERT_PATH = '$SSL_CERT_PATH'
    `$env:CORS_ORIGIN = '$CORS_ORIGIN'
    `$env:DEBUG = '$DEBUG_LEVEL'
    # WebSocket piping configuration
    `$env:WS_SERVER_PORT = $SERVER2_WS_PORT
    `$env:TARGET_SERVER_WS_URL = '$SERVER2_REMOTE_WS_URL'
    `$env:TARGET_SERVER_ID = '$SERVER1_ID'
    `$env:PIPE_REMOTE_ENABLED = '$PIPE_REMOTE_ENABLED'
    cd '$PSScriptRoot'
    Write-Host 'Server 2 starting with PORT=' `$env:PORT ' and WS_PORT=' `$env:WS_SERVER_PORT -ForegroundColor Green
    npx nodemon backend/mediasoupServer/index.js | Tee-Object -FilePath 'logs/server2.log'
    Read-Host 'Press Enter to close this window'
"@
Start-Process powershell -ArgumentList $server2Args -WindowStyle Normal

Write-Host "Both servers started:" -ForegroundColor Green
Write-Host "Server 1 ($SERVER1_ID): Port $SERVER1_PORT, WebSocket Port $SERVER1_WS_PORT, Log: logs/server1.log"
Write-Host "Server 2 ($SERVER2_ID): Port $SERVER2_PORT, WebSocket Port $SERVER2_WS_PORT, Log: logs/server2.log"
Write-Host "Media piping: $PIPE_REMOTE_ENABLED" -ForegroundColor $(if ($PIPE_REMOTE_ENABLED -eq "true") {"Green"} else {"Yellow"})

Write-Host "Note: Each server is running in its own window." -ForegroundColor Yellow
Write-Host "Close the server windows to stop the servers." -ForegroundColor Yellow
