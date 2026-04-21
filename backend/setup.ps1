# ============================================================
# KAI Backend – Setup & Run Script (using uv)
# ============================================================
# Usage:
#   .\setup.ps1 install    → Create venv + install all deps
#   .\setup.ps1 run        → Start the FastAPI server
#   .\setup.ps1 migrate    → Run Alembic migrations
#   .\setup.ps1 all        → Install + migrate + run
# ============================================================

param(
    [Parameter(Position=0)]
    [ValidateSet("install", "run", "migrate", "all")]
    [string]$Command = "all"
)

$ErrorActionPreference = "Stop"
$BackendDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  KAI Backend Setup (uv)" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

function Install-Dependencies {
    Write-Host "[1/3] Creating virtual environment with uv..." -ForegroundColor Yellow
    uv venv
    
    Write-Host "[2/3] Installing dependencies with uv..." -ForegroundColor Yellow
    uv pip install -r requirements.txt
    
    Write-Host "[3/3] Dependencies installed!" -ForegroundColor Green
    Write-Host ""
}

function Run-Migrations {
    Write-Host "[*] Running Alembic migrations..." -ForegroundColor Yellow
    uv run alembic upgrade head
    Write-Host "[*] Migrations complete!" -ForegroundColor Green
    Write-Host ""
}

function Run-Server {
    Write-Host "[*] Starting KAI backend on http://localhost:8000" -ForegroundColor Yellow
    Write-Host "[*] API docs at http://localhost:8000/docs" -ForegroundColor Yellow
    Write-Host "[*] Press Ctrl+C to stop" -ForegroundColor DarkGray
    Write-Host ""
    uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
}

switch ($Command) {
    "install" {
        Install-Dependencies
    }
    "run" {
        Run-Server
    }
    "migrate" {
        Run-Migrations
    }
    "all" {
        Install-Dependencies
        Run-Migrations
        Run-Server
    }
}
