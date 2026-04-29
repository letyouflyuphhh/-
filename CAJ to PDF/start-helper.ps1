$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$helperDir = Join-Path $root "helper"
$venvDir = Join-Path $helperDir ".venv"
$pythonExe = Join-Path $venvDir "Scripts\\python.exe"
$uvicornExe = Join-Path $venvDir "Scripts\\uvicorn.exe"

if (-not (Test-Path $pythonExe)) {
  Write-Host "Creating virtual environment..."
  python -m venv $venvDir
}

Write-Host "Installing helper dependencies..."
& $pythonExe -m pip install -r (Join-Path $helperDir "requirements.txt")

Write-Host "Starting helper on http://127.0.0.1:27183"
& $uvicornExe server:app --host 127.0.0.1 --port 27183 --app-dir $helperDir
