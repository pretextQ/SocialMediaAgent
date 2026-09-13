<#
.SYNOPSIS
    One-click launcher for SocialMediaAgent (backend API + frontend page).

.DESCRIPTION
    Does three things:
      1) preflight: check .venv interpreter and frontend node_modules;
      2) start backend uvicorn and frontend Vite dev server, each in its own window;
      3) wait until both ports answer, then open the browser.

    Mode selects which database the backend uses; the frontend is pointed at it:
      demo (default) -> synthetic demo data (50 contents / 5 topics / seeded evolution)
      real           -> real public data (19 accounts); note the trends page has no topics

    NOTE: this file is intentionally ASCII-only, same as app/scripts/run_ci.ps1.
    Windows PowerShell 5.1 reads .ps1 as the ANSI codepage unless the file has a
    UTF-8 BOM, so non-ASCII text here would be mojibake and break parsing.

.PARAMETER Mode
    demo (default) or real.
.PARAMETER Restart
    Free the ports first. Default: reuse an already-listening instance.
.PARAMETER NoBrowser
    Do not open the browser.
.PARAMETER BackendOnly
    Start backend only.
.PARAMETER TimeoutSeconds
    Max seconds to wait for readiness. Default 120.
.EXAMPLE
    .\start.cmd
.EXAMPLE
    .\start.cmd real -Restart
#>
[CmdletBinding()]
param(
    [ValidateSet('demo', 'real')]
    [string]$Mode = 'demo',
    [switch]$Restart,
    [switch]$NoBrowser,
    [switch]$BackendOnly,
    [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = 'Stop'

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir  = (Resolve-Path (Join-Path $ScriptDir '..\backend')).Path
$FrontendDir = (Resolve-Path (Join-Path $ScriptDir '..\frontend')).Path

$Python       = Join-Path $BackendDir '.venv\Scripts\python.exe'
$BackendPort  = if ($Mode -eq "demo") { 8001 } else { 8000 }
$FrontendPort = 5173
$PageUrl      = "http://127.0.0.1:$FrontendPort"
# Vite dev proxy target. Resolved unconditionally so it can never be skipped:
# a Vite started without it falls back to its own 8000 default, and if this
# launcher put the API on another port every /api call would hit a dead port.
# An explicit VITE_API_TARGET from the caller still wins (see Resolve-ViteApiTarget).
$ApiTarget    = Resolve-ViteApiTarget $env:VITE_API_TARGET $BackendPort
$env:VITE_API_TARGET = $ApiTarget

function Write-Step($text) { Write-Host "==> $text" -ForegroundColor Cyan }
function Write-Ok($text)   { Write-Host "    $text" -ForegroundColor Green }
function Write-Hint($text) { Write-Host "    $text" -ForegroundColor Yellow }

function Test-PortListening([int]$Port) {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Stop-Port([int]$Port) {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
        Write-Hint "freeing port $Port (PID $($conn.OwningProcess))"
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 800
}

function Resolve-ViteApiTarget([string]$Existing, [int]$Port) {
    # The Vite dev proxy target must point at the port the API actually listens on.
    # An explicit VITE_API_TARGET from the caller wins so custom setups keep working.
    if ($Existing) { return $Existing }
    return "http://127.0.0.1:$Port"
}

function Wait-Http([string]$Url, [int]$Seconds) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return $true }
        } catch { }
        Start-Sleep -Milliseconds 700
    }
    return $false
}

# ------------------------------------------------------------------ preflight
Write-Step 'checking environment'
if (-not (Test-Path $Python)) {
    Write-Host "[start] backend interpreter not found:" -ForegroundColor Red
    Write-Host "        $Python" -ForegroundColor Red
    Write-Host "[start] create the venv and install deps first:" -ForegroundColor Red
    Write-Host "        cd app/backend" -ForegroundColor Red
    Write-Host "        python -m venv .venv" -ForegroundColor Red
    Write-Host "        .venv/Scripts/python.exe -m pip install -i https://mirrors.aliyun.com/pypi/simple/ -e .[dev]" -ForegroundColor Red
    exit 1
}
Write-Ok "backend interpreter: $Python"

if (-not $BackendOnly) {
    if (-not (Test-Path (Join-Path $FrontendDir 'node_modules'))) {
        Write-Host "[start] frontend deps missing (no node_modules):" -ForegroundColor Red
        Write-Host "        cd app/frontend" -ForegroundColor Red
        Write-Host "        npm install --registry=https://registry.npmmirror.com" -ForegroundColor Red
        exit 1
    }
    Write-Ok "frontend deps: OK"
}

# ------------------------------------------------------------------ ports
if ($Restart) {
    Write-Step 'freeing ports (-Restart)'
    Stop-Port $BackendPort
    if (-not $BackendOnly) { Stop-Port $FrontendPort }
}

# ------------------------------------------------------------------ backend
Write-Step "starting backend (mode=$Mode, port=$BackendPort)"
if (Test-PortListening $BackendPort) {
    Write-Hint "port $BackendPort already listening - reusing it (use -Restart to relaunch)"
    Write-Hint "-Mode $Mode has NO effect on a reused backend; its database was fixed at ITS launch"
} else {
    if ($Mode -eq 'demo') {
        $env:SMA_DB_URL = 'sqlite:///data/sma_demo.db'
        $env:SMA_MEMORY_DB_URL = 'sqlite:///data/sma_demo_memory.db'
    }
    $backendProc = Start-Process -FilePath $Python `
        -ArgumentList @('-m', 'uvicorn', 'socialmedia_agent.api.main:app', '--host', '127.0.0.1', '--port', "$BackendPort") `
        -WorkingDirectory $BackendDir -PassThru
    Write-Ok "backend started (PID $($backendProc.Id)) - see the new window for logs"
}

# ------------------------------------------------------------------ frontend
if (-not $BackendOnly) {
    Write-Step "frontend (port=$FrontendPort, proxy -> $ApiTarget)"
    if (Test-PortListening $FrontendPort) {
        Write-Hint "port $FrontendPort already listening - reusing it (use -Restart to relaunch)"
        Write-Hint "a reused Vite keeps ITS OWN proxy target; if the page shows no data, run with -Restart"
    } else {
        $frontendProc = Start-Process -FilePath cmd.exe `
            -ArgumentList @('/k', 'npm run dev') `
            -WorkingDirectory $FrontendDir -PassThru
        Write-Ok "frontend started (PID $($frontendProc.Id)) - see the new window for logs"
    }
}

# ------------------------------------------------------------------ wait
Write-Step 'waiting for services to become ready'
$apiUrl   = "http://127.0.0.1:$BackendPort/api/v1/accounts"
$apiReady = Wait-Http $apiUrl $TimeoutSeconds
if ($apiReady) { Write-Ok "backend ready: $apiUrl" }
else { Write-Host "[start] backend not ready within $TimeoutSeconds s - check the backend window" -ForegroundColor Red }

$pageReady = $true
if (-not $BackendOnly) {
    $pageReady = Wait-Http $PageUrl $TimeoutSeconds
    if ($pageReady) { Write-Ok "frontend ready: $PageUrl" }
    else { Write-Host "[start] frontend not ready within $TimeoutSeconds s - check the frontend window" -ForegroundColor Red }
}

# ------------------------------------------------------------------ browser
if ($pageReady -and -not $NoBrowser -and -not $BackendOnly) {
    Write-Step 'opening browser'
    Start-Process $PageUrl
}

# ------------------------------------------------------------------ summary
Write-Host ""
Write-Host "================ SocialMediaAgent is up ================" -ForegroundColor Cyan
Write-Host "  mode      : $Mode   (switch: start.cmd real  /  start.cmd demo -Restart)"
Write-Host "  page      : $PageUrl"
if (-not $BackendOnly) { Write-Host "  api docs  : http://127.0.0.1:$BackendPort/docs" }
if (-not $BackendOnly) { Write-Host "  proxy     : $ApiTarget  (Vite dev proxy for /api)" }
Write-Host "  where     : Dashboard -> Data -> Strategy -> Trends (demo has evolution signals)"
Write-Host "  stop      : close the two new windows"
Write-Host "=======================================================" -ForegroundColor Cyan

if (-not $apiReady) { exit 2 }
if (-not $pageReady) { exit 3 }
exit 0