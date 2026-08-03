#!/usr/bin/env node
/**
 * Make the compiled entrypoint executable.
 *
 * `dist/index.js` is the package `bin` target and carries a `#!/usr/bin/env node`
 * shebang, but `tsc` writes it 0644. npm sets the bit itself when installing from
 * the registry, so published consumers never see this; a local build does. With
 * the bit missing, npx run from the package's own directory resolves the local
 * `bin` and fails with `sh: 1: claude-mcp-bridge: Permission denied`, which an MCP
 * client surfaces only as `Connection closed`.
 *
 * `chmod` via the shell would not survive on Windows, hence the node one-liner.
 */
import { chmodSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const entry = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");

try {
  statSync(entry);
} catch {
  console.error(`postbuild: ${entry} not found. Did tsc fail?`);
  process.exit(1);
}

chmodSync(entry, 0o755);
