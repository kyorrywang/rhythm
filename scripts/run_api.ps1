$ErrorActionPreference = "Stop"

Write-Host "Starting Rhythm API Server..." -ForegroundColor Cyan

# Check if venv exists
if (-Not (Test-Path ".venv")) {
    Write-Host "Virtual environment not found! Please run: python -m venv .venv" -ForegroundColor Red
    exit 1
}

# Add core to PYTHONPATH so API can import it directly
$env:PYTHONPATH = "$PWD\core;$PWD\apps\api"

# Run Uvicorn from the venv
& .\.venv\Scripts\uvicorn.exe "apps.api.main:app" --host 127.0.0.1 --port 8000 --reload --reload-dir apps\api --reload-dir core
