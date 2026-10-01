import type { Provider } from "./types";
import { isLocalModelId, parseLocalModelId } from "./localModels";

// ---------------------------------------------------------------------------
// Canonical model IDs
// ---------------------------------------------------------------------------
// Cloud models are fixed (they only work with an API key). Local models are
// NOT listed here: the user scans their computer and enables the models they
// want. Their ids start with "local:" — see localModels.ts.

// Main-chat tier (top-end) — user picks one of these per message.
export const CLAUDE_MAIN_MODELS = ["claude-opus-4-7", "claude-sonnet-4-6"] as const;
export const GEMINI_MAIN_MODELS = [
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
] as const;

// Mid-tier (used for tabular review) — user picks one in account settings.
export const CLAUDE_MID_MODELS = ["claude-sonnet-4-6"] as const;
export const GEMINI_MID_MODELS = ["gemini-3-flash-preview"] as const;

// Low-tier (used for title generation, lightweight extractions).
export const CLAUDE_LOW_MODELS = ["claude-haiku-4-5"] as const;
export const GEMINI_LOW_MODELS = ["gemini-3.1-flash-lite-preview"] as const;

export const DEFAULT_MAIN_MODEL = "claude-sonnet-4-6";
export const DEFAULT_TITLE_MODEL = "claude-haiku-4-5";
export const DEFAULT_TABULAR_MODEL = "claude-sonnet-4-6";

const CLOUD_MODELS = new Set<string>([
    ...CLAUDE_MAIN_MODELS,
    ...GEMINI_MAIN_MODELS,
    ...CLAUDE_MID_MODELS,
    ...GEMINI_MID_MODELS,
    ...CLAUDE_LOW_MODELS,
    ...GEMINI_LOW_MODELS,
]);

// ---------------------------------------------------------------------------
// Provider inference
// ---------------------------------------------------------------------------

export function providerForModel(model: string): Provider {
    if (isLocalModelId(model)) return "local";
    if (model.startsWith("claude")) return "claude";
    if (model.startsWith("gemini")) return "gemini";
    throw new Error(`Unknown model id: ${model}`);
}

/**
 * Accept a known cloud model or any well-formed local model id; otherwise
 * use the fallback. Whether a local model is actually running is checked
 * when the request is sent, which gives the user a clear error message.
 */
export function resolveModel(id: string | null | undefined, fallback: string): string {
    if (!id) return fallback;
    if (CLOUD_MODELS.has(id)) return id;
    if (parseLocalModelId(id)) return id;
    return fallback;
}
