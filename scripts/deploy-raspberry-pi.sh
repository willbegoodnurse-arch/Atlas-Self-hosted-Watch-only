#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
PREVIOUS_COMMIT=""
NEW_COMMIT=""
RESTARTED_SERVICES=0

log() {
  printf '\n==> %s\n' "$*"
}

warn() {
  printf '\nWARNING: %s\n' "$*" >&2
}

die() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

print_rollback_guidance() {
  if [[ -n "${PREVIOUS_COMMIT}" && -n "${NEW_COMMIT}" ]]; then
    cat <<EOF

Rollback guidance:
  previous commit: ${PREVIOUS_COMMIT}
  new commit:      ${NEW_COMMIT}

Manual rollback command:
  git reset --hard ${PREVIOUS_COMMIT}
  ./scripts/deploy-raspberry-pi.sh

Rollback is not automatic. Review the failure before rolling back.
EOF
  fi
}

on_error() {
  local exit_code=$?
  warn "Deploy failed with exit code ${exit_code}."
  if [[ "${RESTARTED_SERVICES}" -eq 0 ]]; then
    warn "Services were not restarted by this script."
  else
    warn "Services were restarted before the failure. Check systemd status and logs."
  fi
  print_rollback_guidance
  exit "${exit_code}"
}

trap on_error ERR

run_step() {
  log "$1"
  shift
  "$@"
}

assert_repo_shape() {
  [[ -f package.json ]] || die "package.json not found. Run this from the Atlas/watch-wallet repository."
  [[ -d apps/web ]] || die "apps/web not found. Repository layout is not recognized."
  [[ -d apps/api ]] || die "apps/api not found. Repository layout is not recognized."
  [[ -d packages/bitcoin ]] || die "packages/bitcoin not found. Repository layout is not recognized."
}

assert_clean_worktree() {
  git update-index -q --refresh
  if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    printf '\nGit worktree is dirty. Refusing to pull, build, or restart services.\n' >&2
    printf 'Changed files:\n' >&2
    git status --short >&2
    exit 1
  fi
}

cd "${REPO_ROOT}"

log "Atlas Raspberry Pi deploy"
printf 'Repository: %s\n' "${REPO_ROOT}"

assert_repo_shape
assert_clean_worktree

PREVIOUS_COMMIT="$(git rev-parse HEAD)"
run_step "Pull latest commits with fast-forward only" git pull --ff-only
NEW_COMMIT="$(git rev-parse HEAD)"

printf '\nPrevious commit: %s\n' "${PREVIOUS_COMMIT}"
printf 'New commit:      %s\n' "${NEW_COMMIT}"

run_step "Install dependencies without deleting node_modules" npm install
assert_clean_worktree

run_step "Build Bitcoin package" npm run build --workspace=packages/bitcoin
run_step "Build Atlas API" npm run build --workspace=apps/api

WEB_NEXT_DIR="${REPO_ROOT}/apps/web/.next"
[[ "${WEB_NEXT_DIR}" == "${REPO_ROOT}/apps/web/.next" ]] || die "Refusing to remove unexpected .next path."
run_step "Remove stale Next.js build cache" rm -rf -- "${WEB_NEXT_DIR}"
run_step "Build Atlas web" npm run build --workspace=apps/web

run_step "Restart Atlas systemd services" sudo systemctl restart atlas-api atlas-web
RESTARTED_SERVICES=1

run_step "Check atlas-api service status" sudo systemctl status atlas-api --no-pager --lines=20
run_step "Check atlas-web service status" sudo systemctl status atlas-web --no-pager --lines=20

run_step "Check local API session endpoint" curl --silent --show-error --fail --max-time 10 --output /dev/null \
  http://127.0.0.1:3011/api/auth/session
run_step "Check local web endpoint" curl --silent --show-error --fail --max-time 10 --output /dev/null \
  http://127.0.0.1:3000/

log "Check local mempool tip height (warning only)"
if ! curl --silent --show-error --max-time 10 --output /dev/null \
  http://127.0.0.1:8080/api/blocks/tip/height; then
  warn "Local mempool tip height check failed. Deploy remains successful; check mempool separately."
fi

cat <<EOF

Deploy completed.

Safety reminders:
  - PC direct access to :3011 should fail in hardened same-origin mode.
  - Bitcoin Core RPC :8332 must not be public.
  - No secrets were printed by this script.
  - No transaction broadcast was performed by this script.
EOF

print_rollback_guidance
