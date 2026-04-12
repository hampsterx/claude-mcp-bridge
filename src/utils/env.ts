const ALLOWED_ENV_KEYS = [
  "CLAUDE_CONFIG_DIR",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "HOME",
  "PATH",
  "USER",
  "SHELL",
  "LANG",
  "TERM",
  "XDG_CONFIG_HOME",
];

/**
 * Build a minimal, safe environment for Claude CLI subprocesses.
 *
 * By default, uses subscription auth (OAuth tokens in ~/.claude/).
 * Set CLAUDE_BRIDGE_USE_API_KEY=1 to forward ANTHROPIC_API_KEY to the subprocess.
 */
export function buildSubprocessEnv(): Record<string, string> {
  const env: Record<string, string> = {
    NO_COLOR: "1",
    FORCE_COLOR: "0",
  };

  if (process.env["CLAUDE_BRIDGE_USE_API_KEY"] === "1") {
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (apiKey) {
      env["ANTHROPIC_API_KEY"] = apiKey;
    }
  }

  for (const key of ALLOWED_ENV_KEYS) {
    const value = process.env[key];
    if (value) {
      env[key] = value;
    }
  }

  return env;
}
