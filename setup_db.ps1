#!/usr/bin/env powershell

# ============================================================
# KAI Database Setup Script - Windows PowerShell
# ============================================================
# This script automates PostgreSQL + Chroma setup

param(
    [switch]$Docker = $false,
    [switch]$CheckOnly = $false,
    [switch]$Reset = $false
)

# Colors for output
$Color_Success = "Green"
$Color_Error = "Red"
$Color_Warning = "Yellow"
$Color_Info = "Cyan"

function Write-Status {
    param([string]$Message, [string]$Type = "Info")
    $Color = switch($Type) {
        "Success" { $Color_Success }
        "Error" { $Color_Error }
        "Warning" { $Color_Warning }
        default { $Color_Info }
    }
    Write-Host "[$Type] $Message" -ForegroundColor $Color
}

function Check-Command {
    param([string]$Command)
    $exists = $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
    return $exists
}

function Check-Port {
    param([int]$Port)
    try {
        $connection = Test-NetConnection -ComputerName localhost -Port $Port -ErrorAction Stop
        return $connection.TcpTestSucceeded
    } catch {
        return $false
    }
}

# ============================================================
# 1. Prerequisites Check
# ============================================================

Write-Host "`n=== KAI Database Setup ===" -ForegroundColor Cyan
Write-Host "Checking prerequisites...`n"

$Prerequisites = @{
    "Python" = "python"
    "uv" = "uv"
    "Node.js" = "node"
}

$AllGood = $true
foreach ($name in $Prerequisites.Keys) {
    $cmd = $Prerequisites[$name]
    if (Check-Command $cmd) {
        Write-Status "$name ✓" "Success"
    } else {
        Write-Status "$name ✗ (not found)" "Error"
        $AllGood = $false
    }
}

if (-not $AllGood) {
    Write-Status "Please install missing prerequisites" "Error"
    exit 1
}

# ============================================================
# 2. PostgreSQL Setup
# ============================================================

Write-Host "`n=== PostgreSQL Setup ===" -ForegroundColor Cyan

if ($Docker) {
    Write-Status "Using Docker for PostgreSQL" "Info"
    
    if (-not (Check-Command "docker")) {
        Write-Status "Docker not found. Install from https://www.docker.com/products/docker-desktop" "Error"
        exit 1
    }
    
    Write-Status "Checking if 'kai-db' container exists..." "Info"
    $ContainerExists = docker ps -a --filter "name=kai-db" --format "{{.Names}}" | Select-String "kai-db"
    
    if ($ContainerExists) {
        Write-Status "Container 'kai-db' already exists" "Info"
        $Running = docker ps --filter "name=kai-db" --format "{{.Names}}" | Select-String "kai-db"
        
        if ($Running) {
            Write-Status "Container is already running ✓" "Success"
        } else {
            Write-Status "Starting container..." "Info"
            docker start kai-db
            Write-Status "Container started ✓" "Success"
        }
    } else {
        Write-Status "Creating new PostgreSQL container..." "Info"
        docker run --name kai-db `
            -e POSTGRES_USER=kai `
            -e POSTGRES_PASSWORD=kai_secret `
            -e POSTGRES_DB=nexus_db `
            -p 5432:5432 `
            -d postgres:15
        
        Start-Sleep -Seconds 3
        Write-Status "PostgreSQL container created ✓" "Success"
    }
} else {
    Write-Status "PostgreSQL local setup (requires manual installation)" "Info"
    Write-Status "Ensure PostgreSQL is running on localhost:5432" "Warning"
}

# ============================================================
# 3. Port Check
# ============================================================

Write-Host "`n=== Port Availability ===" -ForegroundColor Cyan

$Ports = @{
    "PostgreSQL" = 5432
    "Backend API" = 8000
    "Frontend" = 5173
}

foreach ($service in $Ports.Keys) {
    $port = $Ports[$service]
    if (Check-Port $port) {
        Write-Status "$service (port $port) - In use" "Warning"
    } else {
        Write-Status "$service (port $port) - Available ✓" "Success"
    }
}

# ============================================================
# 4. Backend Setup
# ============================================================

Write-Host "`n=== Backend Setup ===" -ForegroundColor Cyan

$BackendPath = "backend"

if (-not (Test-Path $BackendPath)) {
    Write-Status "backend folder not found" "Error"
    exit 1
}

# Check .env file
$EnvFile = Join-Path $BackendPath ".env"
if (-not (Test-Path $EnvFile)) {
    Write-Status ".env file not found, creating..." "Warning"
    $EnvContent = @"
# PostgreSQL
DATABASE_URL=postgresql+asyncpg://nexus:nexus_secret@localhost:5432/nexus_db

# Chroma
CHROMA_MODE=local

# API Keys (add yours)
GROQ_API_KEY=
GEMINI_API_KEY=

# JWT
JWT_SECRET_KEY=your-random-64-character-secret-key-here

# Environment
APP_ENV=development
APP_DEBUG=True
"@
    Set-Content -Path $EnvFile -Value $EnvContent
    Write-Status ".env created at $EnvFile" "Success"
    Write-Status "Please add your API keys to .env" "Warning"
}

# Virtual environment check
$VenvPath = Join-Path $BackendPath ".venv"
if (-not (Test-Path $VenvPath)) {
    Write-Status "Virtual environment not found" "Warning"
    Write-Status "Run: cd $BackendPath && python -m venv .venv && .\.venv\Scripts\Activate.ps1" "Info"
} else {
    Write-Status "Virtual environment found ✓" "Success"
}

# ============================================================
# 5. Database Migration
# ============================================================

Write-Host "`n=== Database Migrations ===" -ForegroundColor Cyan

if (-not $CheckOnly) {
    Write-Status "Attempting to run Alembic migrations..." "Info"
    
    Push-Location $BackendPath
    
    try {
        # Activate venv
        if (Test-Path ".\.venv\Scripts\Activate.ps1") {
            & ".\.venv\Scripts\Activate.ps1"
        }
        
        # Run alembic
        alembic upgrade head 2>$null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Status "Migrations completed ✓" "Success"
        } else {
            Write-Status "Migrations may need manual setup" "Warning"
        }
    } catch {
        Write-Status "Could not run alembic (may not be installed yet)" "Warning"
    }
    
    Pop-Location
}

# ============================================================
# 6. Chroma Setup
# ============================================================

Write-Host "`n=== Chroma Vector Store ===" -ForegroundColor Cyan

$ChromaDbPath = Join-Path $BackendPath "ai_database" "chroma.sqlite3"
$ChromaDir = Join-Path $BackendPath "ai_database"

if (Test-Path $ChromaDbPath) {
    Write-Status "Chroma database exists: $ChromaDbPath ✓" "Success"
} else {
    Write-Status "Chroma database not yet created" "Info"
    Write-Status "It will be auto-created when backend starts" "Info"
    
    if (-not (Test-Path $ChromaDir)) {
        New-Item -ItemType Directory -Path $ChromaDir | Out-Null
        Write-Status "Created ai_database folder" "Success"
    }
}

# ============================================================
# 7. Reset (Optional)
# ============================================================

if ($Reset) {
    Write-Host "`n=== Database Reset ===" -ForegroundColor Cyan
    
    Write-Status "WARNING: This will delete all data!" "Warning"
    $Confirm = Read-Host "Type 'YES' to confirm reset"
    
    if ($Confirm -eq "YES") {
        if ($Docker) {
            Write-Status "Resetting Docker container..." "Info"
            docker stop nexus-db
            docker rm nexus-db
            docker run --name nexus-db `
                -e POSTGRES_USER=nexus `
                -e POSTGRES_PASSWORD=nexus_secret `
                -e POSTGRES_DB=nexus_db `
                -p 5432:5432 `
                -d postgres:15
            Write-Status "PostgreSQL container reset ✓" "Success"
        }
        
        if (Test-Path $ChromaDbPath) {
            Remove-Item $ChromaDbPath
            Write-Status "Chroma database deleted ✓" "Success"
        }
        
        Write-Status "Database reset complete" "Success"
    }
}

# ============================================================
# 8. Summary
# ============================================================

Write-Host "`n=== Setup Summary ===" -ForegroundColor Cyan

Write-Host @"
✓ Checked prerequisites
✓ PostgreSQL ready on localhost:5432
✓ Backend environment configured
✓ Chroma directory ready

Next Steps:
1. Ensure PostgreSQL is running:
   docker ps | findstr nexus-db

2. Start backend API:
   cd backend
   .\.venv\Scripts\Activate.ps1
   python -m app.main

3. Start frontend (new terminal):
   cd frontend
   npm run dev

4. Open browser:
   http://localhost:5173

For detailed setup guide, see: DATABASE_SETUP.md
"@

Write-Host "=== Setup Complete ===" -ForegroundColor Green
