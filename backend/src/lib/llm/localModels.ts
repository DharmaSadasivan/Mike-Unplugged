// ---------------------------------------------------------------------------
// Local model registry
// ---------------------------------------------------------------------------
// Local models are not hard-coded. The user scans their machine (see
// localDiscovery.ts), ticks the models they want, and the chosen models are
// saved on their profile as `enabled_local_models`.
//
// Every local model has an id of the form:
//
//     local:<runtime>@<host>:<port>/<model name as the runtime knows it>
//
//     e.g.  local:ollama@localhost:11434/qwen3:8b
//           local:openai@localhost:1234/qwen/qwen3-8b      (LM Studio)
//
// The id carries enough information to reach the model even if the saved
// record is missing, so routing never depends on a hard-coded list.

import { createServerSupabase } from "../supabase";

/** How we talk to the runtime. */
export type LocalRuntimeKind = "ollama" | "openai";

export type LocalModelRecord = {
    /** Stable id, see file header. */
    id: string;
    /** Model name exactly as the runtime expects it in API calls. */
    name: string;
    /** Friendly label for menus. */
    label: string;
    kind: LocalRuntimeKind;
    /** Base URL of the runtime, e.g. http://localhost:11434 (no trailing slash, no /v1). */
    baseUrl: string;
    /** Display name of the runtime, e.g. "Ollama", "LM Studio", "llama.cpp". */
    sourceLabel: string;
    /** true / false when the runtime told us; null when unknown. */
    supportsTools: boolean | null;
    supportsThinking?: boolean | null;
    sizeBytes?: number | null;
    parameterSize?: string | null;
    quantization?: string | null;
    family?: string | null;
    contextLength?: number | null;
};

export const LOCAL_MODEL_ID_PREFIX = "local:";

export function isLocalModelId(id: string | null | undefined): boolean {
    return typeof id === "string" && id.startsWith(LOCAL_MODEL_ID_PREFIX);
}

/** "http://localhost:11434/" -> "localhost:11434" */
export function endpointKeyFromBaseUrl(baseUrl: string): string {
    try {
        const u = new URL(baseUrl);
        const port = u.port || (u.protocol === "https:" ? "443" : "80");
        return `${u.hostname}:${port}`;
    } catch {
        return baseUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    }
}

export function makeLocalModelId(
    kind: LocalRuntimeKind,
    baseUrl: string,
    name: string,
): string {
    return `${LOCAL_MODEL_ID_PREFIX}${kind}@${endpointKeyFromBaseUrl(baseUrl)}/${name}`;
}

export type ParsedLocalModelId = {
    kind: LocalRuntimeKind;
    endpointKey: string;
    name: string;
};

export function parseLocalModelId(id: string): ParsedLocalModelId | null {
    if (!isLocalModelId(id)) return null;
    const rest = id.slice(LOCAL_MODEL_ID_PREFIX.length);
    const at = rest.indexOf("@");
    if (at <= 0) return null;
    const kind = rest.slice(0, at);
    if (kind !== "ollama" && kind !== "openai") return null;
    const afterAt = rest.slice(at + 1);
    // Model names may contain "/" (e.g. "qwen/qwen3-8b"), so split on the
    // FIRST slash only. The endpoint key (host:port) never contains one.
    const slash = afterAt.indexOf("/");
    if (slash <= 0 || slash === afterAt.length - 1) return null;
    return {
        kind,
        endpointKey: afterAt.slice(0, slash),
        name: afterAt.slice(slash + 1),
    };
}

// ---------------------------------------------------------------------------
// Persistence (user_profiles.enabled_local_models)
// ---------------------------------------------------------------------------

function sanitizeRecord(raw: unknown): LocalModelRecord | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const kind = r.kind === "ollama" || r.kind === "openai" ? r.kind : null;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const baseUrl =
        typeof r.baseUrl === "string" ? r.baseUrl.trim().replace(/\/+$/, "") : "";
    if (!kind || !name || !/^https?:\/\//i.test(baseUrl)) return null;
    const id = makeLocalModelId(kind, baseUrl, name);
    const num = (v: unknown) =>
        typeof v === "number" && Number.isFinite(v) ? v : null;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
    const bool = (v: unknown) => (typeof v === "boolean" ? v : null);
    return {
        id,
        name,
        label: str(r.label) ?? name,
        kind,
        baseUrl,
        sourceLabel: str(r.sourceLabel) ?? (kind === "ollama" ? "Ollama" : "Local server"),
        supportsTools: bool(r.supportsTools),
        supportsThinking: bool(r.supportsThinking),
        sizeBytes: num(r.sizeBytes),
        parameterSize: str(r.parameterSize),
        quantization: str(r.quantization),
        family: str(r.family),
        contextLength: num(r.contextLength),
    };
}

export function sanitizeLocalModelList(raw: unknown): LocalModelRecord[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: LocalModelRecord[] = [];
    for (const item of raw) {
        const rec = sanitizeRecord(item);
        if (!rec || seen.has(rec.id)) continue;
        seen.add(rec.id);
        out.push(rec);
    }
    return out;
}

// In-memory cache so routing a message does not re-read the profile each time.
const cacheByUser = new Map<string, LocalModelRecord[]>();

export async function getEnabledLocalModels(
    userId: string,
    db?: ReturnType<typeof createServerSupabase>,
): Promise<LocalModelRecord[]> {
    const cached = cacheByUser.get(userId);
    if (cached) return cached;
    const client = db ?? createServerSupabase();
    const { data } = await client
        .from("user_profiles")
        .select("enabled_local_models")
        .eq("user_id", userId)
        .single();
    const list = sanitizeLocalModelList(data?.enabled_local_models);
    cacheByUser.set(userId, list);
    return list;
}

export async function saveEnabledLocalModels(
    userId: string,
    models: unknown,
    db?: ReturnType<typeof createServerSupabase>,
): Promise<LocalModelRecord[]> {
    const list = sanitizeLocalModelList(models);
    const client = db ?? createServerSupabase();
    await client
        .from("user_profiles")
        .upsert(
            { user_id: userId },
            { onConflict: "user_id", ignoreDuplicates: true },
        );
    const { error } = await client
        .from("user_profiles")
        .update({
            enabled_local_models: list,
            updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    if (error) throw new Error(error.message);
    cacheByUser.set(userId, list);
    return list;
}

/** Look a model up across every cached user (the app is single-user locally). */
function findCachedRecord(id: string): LocalModelRecord | null {
    for (const list of cacheByUser.values()) {
        const hit = list.find((m) => m.id === id);
        if (hit) return hit;
    }
    return null;
}

export type LocalTarget = {
    kind: LocalRuntimeKind;
    baseUrl: string;
    name: string;
    supportsTools: boolean | null;
};

/**
 * Work out where to send a request for a local model id. Uses the saved
 * record when there is one (keeps custom URLs such as https or path prefixes)
 * and otherwise rebuilds the address from the id itself.
 */
export async function resolveLocalTarget(id: string): Promise<LocalTarget> {
    const parsed = parseLocalModelId(id);
    if (!parsed) throw new Error(`Invalid local model id: ${id}`);

    let record = findCachedRecord(id);
    if (!record) {
        // Cache is empty after a restart: load the local user's profile.
        const userId = process.env.LOCAL_USER_ID ?? "local-user";
        try {
            const list = await getEnabledLocalModels(userId);
            record = list.find((m) => m.id === id) ?? null;
        } catch {
            record = null;
        }
    }

    return {
        kind: parsed.kind,
        baseUrl: record?.baseUrl ?? `http://${parsed.endpointKey}`,
        name: record?.name ?? parsed.name,
        supportsTools: record?.supportsTools ?? null,
    };
}

/** First enabled local model, used as a fallback when no cloud key exists. */
export async function firstEnabledLocalModelId(
    userId: string,
    db?: ReturnType<typeof createServerSupabase>,
): Promise<string | null> {
    const list = await getEnabledLocalModels(userId, db);
    return list[0]?.id ?? null;
}
