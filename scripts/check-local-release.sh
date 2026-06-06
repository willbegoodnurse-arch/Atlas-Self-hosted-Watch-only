#!/usr/bin/env bash
# Local release-candidate validation for Atlas watch-wallet.
# This script intentionally does not install, update, fix audit findings,
# read .env, or print wallet/security material.

set -euo pipefail

echo "=== Atlas Local Release Validation ==="
echo ""

run_step() {
  local label="$1"
  shift

  echo "--- $label ---"
  "$@"
  echo ""
}

run_step "Typecheck" npm run typecheck
run_step "Tests" npm run test
run_step "Production build" npm run build
run_step "Whitespace diff check" git diff --check
run_step "Production dependency security audit" npm run lint:security

echo ""
echo "=== Local release validation complete ==="
echo "No install, update, audit fix, secret read, deploy, commit, push, or tag action was performed."
