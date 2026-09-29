$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$venvPython = Join-Path $root ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $venvPython)) {
    Write-Host "Creating the HireLens virtual environment..."
    python -m venv .venv
} else {
    Write-Host "Using the existing HireLens virtual environment."
}

& $venvPython -m pip install -r requirements.lock.txt
npm.cmd ci --prefix frontend
npm.cmd run build --prefix frontend
& $venvPython scripts/setup.py
Write-Host "Bootstrap complete. Add GEMINI_API_KEY to .env, then run: .venv\Scripts\python.exe scripts\run.py"
