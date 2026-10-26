$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
npm ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run dist:win -- --publish never
exit $LASTEXITCODE
