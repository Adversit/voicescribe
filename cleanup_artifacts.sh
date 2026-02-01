#!/usr/bin/env bash
set -euo pipefail

# Remove build artifacts, caches, and local environments for this repo.
# Run with --dry-run to preview what would be removed.

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() {
  printf '%s\n' "$*"
}

run_rm_rf() {
  local target="$1"
  if [[ -e "$target" ]]; then
    if (( DRY_RUN )); then
      log "DRY RUN: rm -rf $target"
    else
      rm -rf "$target"
    fi
  fi
}

DIRS_TO_REMOVE=(
  "app/.build"
  "app/.swiftpm"
  "app/build"
  "app/VoiceScribe.xcodeproj/xcuserdata"
  "app/VoiceScribe.xcodeproj/project.xcworkspace/xcuserdata"
  "app/.swiftpm/xcode/xcuserdata"
  "backend/venv"
)

for rel in "${DIRS_TO_REMOVE[@]}"; do
  run_rm_rf "$ROOT/$rel"
done

CACHE_DIR_NAMES=(
  "__pycache__"
  ".cache"
  ".pytest_cache"
  ".mypy_cache"
  ".ruff_cache"
  ".ipynb_checkpoints"
  ".turbo"
  ".next"
  ".nuxt"
  ".vite"
  "DerivedData"
)

for name in "${CACHE_DIR_NAMES[@]}"; do
  if (( DRY_RUN )); then
    find "$ROOT" -type d -name "$name" -print
  else
    find "$ROOT" -type d -name "$name" -print -exec rm -rf {} +
  fi
done

FILE_PATTERNS=(
  ".DS_Store"
  "*.pyc"
  "*.pyo"
  "*.swp"
  "*.swo"
  "*.tmp"
  "*.temp"
  "*.log"
  "*.orig"
  "*.bak"
)

FIND_EXPR=()
for pat in "${FILE_PATTERNS[@]}"; do
  FIND_EXPR+=( -name "$pat" -o )
done
unset 'FIND_EXPR[${#FIND_EXPR[@]}-1]'

if (( DRY_RUN )); then
  find "$ROOT" -type f \( "${FIND_EXPR[@]}" \) -print
else
  find "$ROOT" -type f \( "${FIND_EXPR[@]}" \) -print -delete
fi

log "Done."
