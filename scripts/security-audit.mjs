import { spawnSync } from "node:child_process";

const knownNextPostcssAdvisory = {
  source: 1117015,
  url: "https://github.com/advisories/GHSA-qx2v-qp2m-jg93",
  nextPath: "node_modules/next",
  postcssPath: "node_modules/next/node_modules/postcss"
};

const audit = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
  encoding: "utf8",
  shell: process.platform === "win32"
});

if (audit.error) {
  console.error(`Unable to run npm audit: ${audit.error.message}`);
  process.exit(2);
}

if (!audit.stdout.trim()) {
  console.error("npm audit returned no JSON output.");
  if (audit.stderr.trim()) {
    console.error(audit.stderr.trim());
  }
  process.exit(2);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch (error) {
  console.error("npm audit returned invalid JSON.");
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exit(2);
}

const vulnerabilities = report.vulnerabilities ?? {};
const entries = Object.entries(vulnerabilities);
const metadata = report.metadata?.vulnerabilities ?? {};
const summary = {
  total: Number(metadata.total ?? entries.length),
  critical: Number(metadata.critical ?? 0),
  high: Number(metadata.high ?? 0),
  moderate: Number(metadata.moderate ?? 0),
  low: Number(metadata.low ?? 0),
  info: Number(metadata.info ?? 0)
};

console.log(
  `Audit summary: ${summary.total} total, ${summary.critical} critical, ${summary.high} high, ${summary.moderate} moderate, ${summary.low} low, ${summary.info} info.`
);

if (entries.length === 0) {
  console.log("No production dependency vulnerabilities reported.");
  process.exit(0);
}

if (isOnlyKnownNextPostcssAdvisory(vulnerabilities)) {
  console.warn("Known accepted audit state: Next bundles PostCSS 8.4.31 affected by GHSA-qx2v-qp2m-jg93.");
  console.warn("Do not run npm audit fix --force. Recheck when a stable Next release updates its bundled PostCSS.");
  process.exit(0);
}

console.error("Unexpected production dependency vulnerabilities are present.");
for (const [name, vulnerability] of entries) {
  const severity = vulnerability?.severity ?? "unknown";
  const via = Array.isArray(vulnerability?.via)
    ? vulnerability.via
        .map((item) => (typeof item === "string" ? item : item?.url ?? item?.title ?? item?.name))
        .filter(Boolean)
        .join(", ")
    : String(vulnerability?.via ?? "unknown");
  console.error(`- ${name}: ${severity}; via ${via}`);
}
console.error("Review before release. This script will not run npm audit fix or npm audit fix --force.");
process.exit(1);

function isOnlyKnownNextPostcssAdvisory(vulnerabilities) {
  const names = Object.keys(vulnerabilities).sort();
  if (names.length !== 2 || names[0] !== "next" || names[1] !== "postcss") {
    return false;
  }

  const next = vulnerabilities.next;
  const postcss = vulnerabilities.postcss;
  return (
    next?.severity === "moderate" &&
    postcss?.severity === "moderate" &&
    Array.isArray(next?.via) &&
    next.via.length === 1 &&
    next.via[0] === "postcss" &&
    Array.isArray(postcss?.via) &&
    postcss.via.some((item) => item?.source === knownNextPostcssAdvisory.source && item?.url === knownNextPostcssAdvisory.url) &&
    Array.isArray(next?.nodes) &&
    next.nodes.includes(knownNextPostcssAdvisory.nextPath) &&
    Array.isArray(postcss?.nodes) &&
    postcss.nodes.includes(knownNextPostcssAdvisory.postcssPath)
  );
}
