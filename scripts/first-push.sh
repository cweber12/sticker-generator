#!/usr/bin/env bash
#
# One-time: turn this folder into the sticker-generator repo and push it.
# Run from the repo root in Git Bash / WSL:  bash scripts/first-push.sh
#
set -euo pipefail

# Bring the agent skills across from the previous repo (not duplicated here).
if [ -d ../sticker-maker/.agents ] && [ ! -d .agents ]; then
  cp -r ../sticker-maker/.agents .agents
  cp ../sticker-maker/skills-lock.json skills-lock.json
  echo "Copied .agents/ and skills-lock.json from ../sticker-maker"
fi

git init -b main
git add -A
git commit -F - <<'MSG'
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
MSG

git remote add origin https://github.com/cweber12/sticker-generator.git
git push -u origin main

echo
echo "Pushed. Next:"
echo "  npm install"
echo "  bash scripts/create-issues.sh   # seeds phase 0-6 issues"
echo "  Settings > Pages > Source: GitHub Actions"
