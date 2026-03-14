$ErrorActionPreference = "Stop"

Write-Host "Setting up Rhythm Python Environment..." -ForegroundColor Cyan

# Step 1: Create virtual environment
if (-Not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to create virtual environment!" -ForegroundColor Red
        exit 1
    }
    Write-Host "Virtual environment created successfully." -ForegroundColor Green
} else {
    Write-Host "Virtual environment already exists." -ForegroundColor Green
}

# Step 2: Activate virtual environment and install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
& .\.venv\Scripts\pip.exe install fastapi uvicorn openai pyyaml pydantic httpx

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install dependencies!" -ForegroundColor Red
    exit 1
}

Write-Host "Python environment setup completed successfully!" -ForegroundColor Green
