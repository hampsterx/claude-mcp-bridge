#!/usr/bin/env node
/**
 * Release-gate guard. Fails when the release is not coherent:
 *   1. CHANGELOG.md has no `## [<version>]` section,
 *   2. server.json or package-lock.json disagree with package.json's version, or
 *   3. server.json omits a `CLAUDE_*` env var that README documents.
 *
 * `version` is read from package.json and treated as the source of truth. A
 * `## [Unreleased]` changelog section is allowed to coexist. Exit 0 when
 * everything lines up, exit 1 with a clear message otherwise.
 *
 * Wired into CI (runs on every PR) and `prepublishOnly`, so a release cannot
 * ship a version without a changelog entry, with a stale lockfile, or with a
 * registry manifest that disagrees. Check 2 protects the publish itself: the
 * MCP Registry rejects a mismatch between `server.json.version`,
 * `packages[0].version` and the npm tarball version. Check 3 protects what
 * users see: registry consumers (the VS Code `@mcp` gallery, PulseMCP) render
 * `environmentVariables` as the configuration surface, so a var missing there
 * is invisible to anyone configuring the server from a listing rather than the
 * repo. The tool-scoping vars are the ones that matter most, since they widen
 * the read-only subprocess sandbox.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => {
  try {
    return readFileSync(join(root, rel), "utf8");
  } catch {
    console.error(`check-release-coherence: cannot read ${rel} (not found or unreadable)`);
    process.exit(1);
  }
};
const readJson = (rel) => {
  const text = read(rel);
  try {
    return JSON.parse(text);
  } catch {
    console.error(`check-release-coherence: ${rel} is not valid JSON`);
    process.exit(1);
  }
};

const errors = [];

const pkg = readJson("package.json");
const version = pkg.version;
if (!version) {
  console.error("check-release-coherence: package.json has no version field");
  process.exit(1);
}

// 1. Changelog section present.
// Match a Keep-a-Changelog version heading: `## [x.y.z]` at line start, with
// or without a trailing ` - <date>`. Escape regex metachars so 0.8.0 stays
// literal. Whitespace is spaces and tabs rather than `\s`, which would span a
// newline and accept `##` and `[0.7.1]` on separate lines; the line must end
// after the version or after a dash-separated suffix, so a half-edited
// `## [0.7.1]-draft` fails the gate instead of passing it.
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const heading = new RegExp(`^##[ \\t]+\\[${escaped}\\]([ \\t]+-[ \\t]+\\S.*)?[ \\t]*$`, "m");
if (!heading.test(read("CHANGELOG.md"))) {
  errors.push(
    `CHANGELOG.md has no "## [${version}]" section. Add a ` +
      `"## [${version}] - <date>" heading with the notable changes before publishing.`,
  );
}

// 2. Version coherence across the files a publish reads.
const lock = readJson("package-lock.json");
const server = readJson("server.json");
const versionFields = [
  ["package-lock.json .version", lock.version],
  ["package-lock.json .packages[''].version", lock.packages?.[""]?.version],
  ["server.json .version", server.version],
  ["server.json .packages[0].version", server.packages?.[0]?.version],
];
for (const [label, actual] of versionFields) {
  if (actual !== version) {
    errors.push(
      `${label} is "${actual ?? "(missing)"}" but package.json version is "${version}". ` +
        `Bump it to "${version}" to keep the release coherent.`,
    );
  }
}

// 3. Env-var coverage: README is the human-facing source of truth, server.json
// is the machine-readable one, and they must agree. Only `CLAUDE_*` names are
// compared; `ANTHROPIC_API_KEY` is a standard Anthropic variable rather than a
// bridge setting, and the registry manifest deliberately leaves it out.
const documented = new Set(
  [...read("README.md").matchAll(/^\|\s*`(CLAUDE_[A-Z0-9_]+)`\s*\|/gm)].map((m) => m[1]),
);
if (documented.size === 0) {
  errors.push(
    "README.md has no `CLAUDE_*` env-var table rows. The extraction pattern " +
      "expects rows shaped `| `CLAUDE_X` | ... |`; update this check if the tables moved.",
  );
}
const declared = new Set(
  (server.packages?.[0]?.environmentVariables ?? []).map((e) => e.name),
);
const missing = [...documented].filter((name) => !declared.has(name)).sort();
if (missing.length > 0) {
  errors.push(
    `server.json declares no environmentVariables entry for: ${missing.join(", ")}. ` +
      `README documents them, so registry consumers would not see them. Add each ` +
      `with a description, format and (where it has one) a string default.`,
  );
}

if (errors.length > 0) {
  console.error("check-release-coherence: release is not coherent:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `check-release-coherence: ${version} is coherent ` +
    `(changelog, version files, ${documented.size} documented env vars) ✓`,
);
