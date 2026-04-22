import os from "node:os";
import type { AdapterModel } from "@paperclipai/adapter-utils";
import {
  asString,
  ensurePathInEnv,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";

const MODELS_CACHE_TTL_MS = 60_000;
const MODELS_TIMEOUT_SEC = 15;

interface CacheEntry {
  expiresAt: number;
  models: AdapterModel[];
}

const discoveryCache = new Map<string, CacheEntry>();

function labelFromId(id: string): string {
  const name = id.includes("/") ? id.slice(id.indexOf("/") + 1) : id;
  return name
    .replace(/[-_.]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

function parseModelsOutput(stdout: string): AdapterModel[] {
  const seen = new Set<string>();
  const result: AdapterModel[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, label: labelFromId(id) });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true, sensitivity: "base" }));
}

export async function discoverCrushModels(opts: {
  command?: unknown;
} = {}): Promise<AdapterModel[]> {
  const command = asString(opts.command, "crush");
  const cwd = process.cwd();
  const runtimeEnv = Object.fromEntries(
    Object.entries(ensurePathInEnv({ ...process.env, HOME: os.homedir() })).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  const result = await runChildProcess(
    `crush-models-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    command,
    ["models"],
    {
      cwd,
      env: runtimeEnv,
      timeoutSec: MODELS_TIMEOUT_SEC,
      graceSec: 3,
      onLog: async () => {},
    },
  );

  if (result.timedOut) {
    throw new Error(`\`crush models\` timed out after ${MODELS_TIMEOUT_SEC}s.`);
  }
  if ((result.exitCode ?? 1) !== 0) {
    const detail = result.stderr.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
    throw new Error(detail ? `\`crush models\` failed: ${detail}` : "`crush models` failed.");
  }

  return parseModelsOutput(result.stdout);
}

export async function listCrushModels(opts: { command?: unknown } = {}): Promise<AdapterModel[]> {
  const command = asString(opts.command, "crush");
  const now = Date.now();

  for (const [key, entry] of discoveryCache) {
    if (entry.expiresAt <= now) discoveryCache.delete(key);
  }

  const cached = discoveryCache.get(command);
  if (cached && cached.expiresAt > now) return cached.models;

  try {
    const models = await discoverCrushModels({ command });
    discoveryCache.set(command, { expiresAt: now + MODELS_CACHE_TTL_MS, models });
    return models;
  } catch {
    return [];
  }
}
