$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is missing. Install Node.js 22.13 or newer from https://nodejs.org/ and run this file again."
  Read-Host "Press Enter to close"
  exit 1
}

$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 22) {
  Write-Host "Snip No Evil needs Node.js 22.13 or newer. Your version is $(node --version)."
  Read-Host "Press Enter to close"
  exit 1
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "Enabling pnpm..."
  corepack enable
  corepack prepare pnpm@11.25.0 --activate
}

Write-Host "Installing Snip No Evil packages..."
pnpm install --frozen-lockfile

Write-Host "Starting Snip No Evil at http://localhost:3000"
Write-Host "Multiplayer rooms use the same Firebase database as the live site."
Write-Host "Keep this window open while you play. Press Control+C to stop."
pnpm run dev
