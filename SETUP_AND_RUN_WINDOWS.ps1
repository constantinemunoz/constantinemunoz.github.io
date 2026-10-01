$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is missing. Install Node.js 22.13 or newer from https://nodejs.org/ and run this file again."
  Read-Host "Press Enter to close"
  exit 1
}

$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 22) {
  Write-Host "BOMBANANA needs Node.js 22.13 or newer. Your version is $(node --version)."
  Read-Host "Press Enter to close"
  exit 1
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "Enabling pnpm..."
  corepack enable
  corepack prepare pnpm@11.25.0 --activate
}

Write-Host "Installing BOMBANANA packages..."
pnpm install --frozen-lockfile

if (-not (Test-Path ".bombanana-local-ready")) {
  Write-Host "Building BOMBANANA..."
  pnpm run build

  Write-Host "Creating the local multiplayer database..."
  Get-ChildItem "drizzle/*.sql" | Sort-Object Name | ForEach-Object {
    node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file $_.FullName
  }
  New-Item ".bombanana-local-ready" -ItemType File -Force | Out-Null
}

Write-Host "Starting BOMBANANA..."
Write-Host "Keep this window open while you play. Press Control+C to stop the game."
pnpm run dev

