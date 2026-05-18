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

echo "--- Production dependency audit ---"
AUDIT_JSON="$(mktemp)"
set +e
npm audit --omit=dev --json > "$AUDIT_JSON"
AUDIT_EXIT=$?
set -e

node - "$AUDIT_JSON" <<'NODE'
const fs = require("node:fs");

const auditPath = process.argv[2];
const report = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const vulnerabilities = report.vulnerabilities ?? {};
const metadata = report.metadata?.vulnerabilities ?? {};
const high = Number(metadata.high ?? 0);
const critical = Number(metadata.critical ?? 0);
const moderate = Number(metadata.moderate ?? 0);
const low = Number(metadata.low ?? 0);
const total = Number(metadata.total ?? 0);

const next = vulnerabilities.next;
const postcss = vulnerabilities.postcss;
const knownNextPostcss =
  Boolean(next) &&
  Boolean(postcss) &&
  String(postcss.range ?? "").includes("<8.5.10") &&
  JSON.stringify(postcss.via ?? []).includes("GHSA-qx2v-qp2m-jg93");

console.log(`Audit summary: ${total} total, ${critical} critical, ${high} high, ${moderate} moderate, ${low} low.`);

if (critical > 0 || high > 0) {
  console.error("High or critical production dependency vulnerabilities are present.");
  console.error("Review them manually. This script will not run npm audit fix or npm audit fix --force.");
  process.exit(2);
}

if (knownNextPostcss && moderate > 0) {
  console.warn("Known audit state: Next currently depends on a vulnerable PostCSS range reported by npm audit.");
  console.warn("Current Phase 56 policy: do not run npm audit fix --force; recheck when a Next 15 patch is available.");
  process.exit(0);
}

if (total > 0) {
  console.warn("Audit reported production dependency findings that are not classified as high or critical.");
  console.warn("Review the full npm audit output manually before release.");
}
NODE
AUDIT_STATUS=$?
rm -f "$AUDIT_JSON"

if [ "$AUDIT_STATUS" -ne 0 ]; then
  exit "$AUDIT_STATUS"
fi

if [ "$AUDIT_EXIT" -ne 0 ]; then
  echo "npm audit returned a non-zero status because findings are present."
  echo "This is acceptable only for the documented Next/PostCSS moderate audit state."
fi

echo ""
echo "=== Local release validation complete ==="
echo "No install, update, audit fix, secret read, deploy, commit, push, or tag action was performed."
