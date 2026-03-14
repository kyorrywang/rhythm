$ErrorActionPreference = "Stop"

Write-Host "Starting Rhythm Desktop App..." -ForegroundColor Cyan

cd apps\desktop
if (-Not (Test-Path "node_modules")) {
    Write-Host "Installing NPM dependencies..." -ForegroundColor Yellow
    npm install
}

npm run tauri dev
