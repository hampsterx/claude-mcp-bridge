const ALLOWED_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
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

/** Build a minimal, safe environment for Claude CLI subprocesses. */
export function buildSubprocessEnv(): Record<string, string> {
  const env: Record<string, string> = {
    NO_COLOR: "1",
    FORCE_COLOR: "0",
  };

  for (const key of ALLOWED_ENV_KEYS) {
    const value = process.env[key];
    if (value) {
      env[key] = value;
    }
  }

  return env;
}
