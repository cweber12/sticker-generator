# One-time: turn this folder into the sticker-generator repo and push it.
# Run from the repo root in PowerShell:  .\scripts\first-push.ps1
#
# (There is a bash equivalent at scripts/first-push.sh for Git Bash / WSL.)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path .\package.json)) {
  throw "Run this from the repo root (the folder containing package.json)."
}

# The .github/ files cannot be written by the remote bridge - they arrive in
# protected-files.zip and must be extracted here first.
if (-not (Test-Path .\.github\workflows\ci.yml)) {
  Write-Warning "'.github\workflows\ci.yml' is missing - extract protected-files.zip at the repo root first, or CI and Pages will not be set up."
  $answer = Read-Host "Continue anyway? (y/N)"
  if ($answer -ne 'y') { exit 1 }
}

# Bring the agent skills across from the previous repo (not duplicated here).
if ((Test-Path ..\sticker-maker\.agents) -and -not (Test-Path .\.agents)) {
  Copy-Item ..\sticker-maker\.agents .\.agents -Recurse
  Copy-Item ..\sticker-maker\skills-lock.json .\skills-lock.json
  Write-Host "Copied .agents\ and skills-lock.json from ..\sticker-maker"
}

git init -b main
git add -A

$message = @'
feat(config): scaffold image-centric sticker generator

Fresh repo replacing the row-centric sticker-maker. The image is the record;
size and type are axes of a request, not properties of a sticker.

Phase 1 complete (docs/v2-plan.md section 9):
- config/variants.ts and config/template.ts as the only enumeration points
- real-unit system (inches/points), replacing v1's design-unit conversion
- render/slots.ts: independent barcode and logo marks, four combinations
- render/renderSticker.ts: one code path for preview and print via scale
- render/fonts.ts: awaited loading plus measurement-based verification,
  fixing v1's silent canvas font substitution
- lib/parseFilename.ts and lib/normalize.ts as the metadata source
- 44 tests covering slot math, filename parsing and key normalization

Not ported: spreadsheet import, column mapper, fuzzy image matching, manual
row entry, the pixel-value layout editor, and the selectable-text PDF path.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vk8ii4o7TJwPgvR3w7DqGm
'@

$tmp = [System.IO.Path]::GetTempFileName()
# UTF8 without BOM - git mangles a BOM in a commit message file.
[System.IO.File]::WriteAllText($tmp, $message, (New-Object System.Text.UTF8Encoding $false))
git commit -F $tmp
Remove-Item $tmp

git remote add origin https://github.com/cweber12/sticker-generator.git
git push -u origin main

Write-Host ""
Write-Host "Pushed. Next:" -ForegroundColor Green
Write-Host "  npm install"
Write-Host "  gh auth status          # then seed the issue tracker:"
Write-Host "  bash scripts\create-issues.sh   (needs Git Bash - see below)"
Write-Host "  Settings > Pages > Source: GitHub Actions"
