#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Only scan tracked files.
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repo (cannot run template audit)." >&2
  exit 2
fi

# 1) Block private key material.
if git ls-files -z | xargs -0 rg -n "BEGIN (RSA|OPENSSH) PRIVATE KEY" >/dev/null; then
  echo "Found a private key block in tracked files." >&2
  git ls-files -z | xargs -0 rg -n "BEGIN (RSA|OPENSSH) PRIVATE KEY" || true
  exit 1
fi

# 2) Block machine-specific coupling.
BAD="(hetzner-jarv\\.tail|tail3087e9\\.ts\\.net)"
if git ls-files -z | xargs -0 rg -n "$BAD" >/dev/null; then
  echo "Found machine-specific coupling in tracked files:" >&2
  git ls-files -z | xargs -0 rg -n "$BAD" || true
  exit 1
fi

# 2b) Block deployment-specific template residue.
#
# Canonical repository links, maintainer contacts, and Builderz attribution are
# expected in this public project. This check targets private deployment names,
# not the repository's own identity.
BAD_TEMPLATE_RESIDUE="(leads-prod)"
TRACKED_NO_SELF="$(git ls-files | rg -v '^scripts/template-audit\.sh$' || true)"
if [ -n "$TRACKED_NO_SELF" ] && printf '%s\n' "$TRACKED_NO_SELF" | xargs rg -n -i "$BAD_TEMPLATE_RESIDUE" >/dev/null; then
  echo "Found org-specific residue in tracked files:" >&2
  printf '%s\n' "$TRACKED_NO_SELF" | xargs rg -n -i "$BAD_TEMPLATE_RESIDUE" || true
  exit 1
fi

# 3) Block tracked env files (allow .env.example).
BAD_ENV="^(\\.env|\\.env\\.local|\\.env\\.production|\\.env\\.development|\\.env\\.test)$"
if git ls-files | rg -n "$BAD_ENV" >/dev/null; then
  echo "Tracked .env file detected (should not be committed)." >&2
  git ls-files | rg -n "$BAD_ENV" || true
  exit 1
fi

echo "Template audit: OK"
