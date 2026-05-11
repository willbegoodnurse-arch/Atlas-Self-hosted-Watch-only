import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRootEnvPath = path.resolve(moduleDir, "..", "..", "..", ".env");

loadEnvFile(repoRootEnvPath);

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed || process.env[parsed.key] !== undefined) {
      continue;
    }

    process.env[parsed.key] = parsed.value;
  }
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const equalsIndex = trimmed.indexOf("=");
  if (equalsIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, equalsIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }

  let value = trimmed.slice(equalsIndex + 1).trim();
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return {
    key,
    value
  };
}
