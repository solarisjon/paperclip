export const type = "crush_local";
export const label = "Crush (local)";

export const models = [
  { id: "", label: "Default (from Crush config)" },
  { id: "llm-proxy/claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
  { id: "llm-proxy/claude-opus-4.6", label: "Claude Opus 4.6" },
  { id: "llm-proxy/claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
  { id: "llm-proxy/claude-opus-4.5", label: "Claude Opus 4.5" },
  { id: "llm-proxy/claude-haiku-4.5", label: "Claude Haiku 4.5" },
  { id: "llm-proxy/gpt-4o", label: "GPT-4o" },
  { id: "llm-proxy/gpt-4.1", label: "GPT-4.1" },
  { id: "llm-proxy/gemini-3-pro-preview", label: "Gemini 3 Pro" },
  { id: "llm-proxy/gemini-3-flash-preview", label: "Gemini 3 Flash" },
];

export const agentConfigurationDoc = `# crush_local agent configuration

Adapter: crush_local

Use when:
- You want Paperclip to run the Crush CLI locally on the host machine
- You need a lightweight agent that can run tasks using Crush's built-in tool suite
- You want session persistence across heartbeats (Crush supports --session resumption)
- opencode_local or other adapters are not working or not installed

Don't use when:
- You need structured JSON streaming output for rich run viewer transcripts (use claude_local)
- You need webhook-style external invocation (use http or openclaw_gateway)
- You only need a one-shot script without an AI coding agent loop (use process)
- Crush CLI is not installed on the machine that runs Paperclip

Core fields:
- cwd (string, optional): absolute working directory for the agent process (created if missing)
- instructionsFilePath (string, optional): absolute path to a markdown instructions file prepended to the run prompt
- promptTemplate (string, optional): run prompt template with {{context.*}} interpolation
- model (string, optional): model in provider/model format (e.g. llm-proxy/claude-sonnet-4.6). Defaults to Crush's configured default.
- command (string, optional): path to crush binary. Defaults to "crush".
- extraArgs (string[], optional): additional CLI args appended to "crush run"
- env (object, optional): KEY=VALUE environment variables injected into the agent process

Operational fields:
- timeoutSec (number, optional): run timeout in seconds (0 = no timeout)
- graceSec (number, optional): SIGTERM grace period in seconds (default: 15)

Notes:
- Prompts are passed to Crush as a positional argument to \`crush run\`; output is plain text.
- Sessions resume with --session <id> when stored session cwd matches the current cwd.
- Paperclip injects skills into \`~/.config/crush/skills/\` via symlinks at runtime.
- Crush runs non-interactively; permissions are auto-accepted in non-interactive mode.
- Token usage and cost are not available from the Crush CLI output.
`;
