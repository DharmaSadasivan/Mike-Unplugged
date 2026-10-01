// ---------------------------------------------------------------------------
// Local model discovery ("Scan my computer")
// ---------------------------------------------------------------------------
// Checks the usual addresses where local LLM runtimes listen and asks each
// one which models it has. Nothing is downloaded or changed; this is a
// read-only scan.
//
// Supported out of the box:
//   - Ollama                       (native API,  default :11434)
//   - LM Studio                    (OpenAI API,  default :1234)
//   - llama.cpp server / LocalAI   (OpenAI API,  default :8080)
//   - Jan                          (OpenAI API,  default :1337)
//   - vLLM                         (OpenAI API,  default :8000)
//   - KoboldCpp                    (OpenAI API,  default :5001)
//   - text-generation-webui        (OpenAI API,  default :5000)
//   - Any other OpenAI-compatible server the user adds (LOCAL_LLM_ENDPOINTS
//     in backend/.env, or the "custom address" box in the scan window).

import {
    makeLocalModelId,
    type LocalModelRecord,
    type LocalRuntimeKind,
} from "./localModels";

const PROBE_TIMEOUT_MS = 1500;
const SHOW_TIMEOUT_MS = 4000;

export type CandidateEndpoint = { baseUrl: string; label: string };

export type ScannedRuntime = {
    baseUrl: string;
    label: string;
    kind: LocalRuntimeKind | null;
    reachable: boolean;
    modelCount: number;
    error?: string;
};

export type ScannedModel = LocalModelRecord & {
    /** Embedding-only models cannot chat, so the UI shows them but blocks them. */
    isEmbedding: boolean;
    /** LM Studio only: whether the model is loaded into memory right now. */
    loaded?: boolean | null;
};

export type ScanResult = {
    scannedAt: string;
    runtimes: ScannedRuntime[];
    models: ScannedModel[];
};

export function normalizeBaseUrl(raw: string): string | null {
    let s = raw.trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
    try {
        const u = new URL(s);
        if (u.protocol !== "http:" && u.protocol !== "https:") return null;
        // Users often paste ".../v1" from runtime docs; we add paths ourselves.
        let path = u.pathname.replace(/\/+$/, "");
        path = path.replace(/\/v1$/i, "").replace(/\/api$/i, "");
        return `${u.protocol}//${u.host}${path}`;
    } catch {
        return null;
    }
}

export function defaultCandidateEndpoints(): CandidateEndpoint[] {
    const list: CandidateEndpoint[] = [];
    const push = (raw: string | undefined, label: string) => {
        if (!raw) return;
        const baseUrl = normalizeBaseUrl(raw);
        if (baseUrl && !list.some((c) => c.baseUrl === baseUrl)) {
            list.push({ baseUrl, label });
        }
    };

    push(process.env.OLLAMA_BASE_URL, "Ollama");
    push("http://localhost:11434", "Ollama");
    push("http://localhost:1234", "LM Studio");
    push("http://localhost:8080", "llama.cpp / LocalAI");
    push("http://localhost:1337", "Jan");
    push("http://localhost:8000", "vLLM");
    push("http://localhost:5001", "KoboldCpp");
    push("http://localhost:5000", "text-generation-webui");

    for (const raw of (process.env.LOCAL_LLM_ENDPOINTS ?? "").split(",")) {
        push(raw, "Custom server");
    }
    return list;
}

async function getJson(
    url: string,
    init: RequestInit = {},
    timeoutMs = PROBE_TIMEOUT_MS,
): Promise<unknown> {
    const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("json")) {
        // Some servers answer every path with an HTML page; that is not a model API.
        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch {
            throw new Error("Not a JSON API");
        }
    }
    return res.json();
}

function looksLikeEmbeddingName(name: string): boolean {
    if (/embed|rerank/i.test(name)) return true;
    // Common embedding families that do not say "embed" in the name.
    return /(^|[-_/:.])(bge|e5|gte|minilm)([-_/:.]|$)/i.test(name);
}

function prettifyName(name: string): string {
    // "qwen3:8b" -> "qwen3:8b" ; "qwen/qwen3-8b" -> "qwen3-8b"
    const last = name.split("/").pop() ?? name;
    return last.replace(/:latest$/, "");
}

// ------------------------------- Ollama -----------------------------------

type OllamaTag = {
    name?: string;
    model?: string;
    size?: number;
    details?: {
        family?: string;
        families?: string[] | null;
        parameter_size?: string;
        quantization_level?: string;
    };
};

async function ollamaShow(
    baseUrl: string,
    name: string,
): Promise<{ capabilities: string[] | null; contextLength: number | null }> {
    try {
        const data = (await getJson(
            `${baseUrl}/api/show`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // Newer Ollama uses "model", older uses "name"; send both.
                body: JSON.stringify({ model: name, name }),
            },
            SHOW_TIMEOUT_MS,
        )) as {
            capabilities?: unknown;
            model_info?: Record<string, unknown>;
        };
        const capabilities = Array.isArray(data.capabilities)
            ? data.capabilities.filter((c): c is string => typeof c === "string")
            : null;
        let contextLength: number | null = null;
        for (const [key, value] of Object.entries(data.model_info ?? {})) {
            if (key.endsWith(".context_length") && typeof value === "number") {
                contextLength = value;
                break;
            }
        }
        return { capabilities, contextLength };
    } catch {
        return { capabilities: null, contextLength: null };
    }
}

async function scanOllama(
    endpoint: CandidateEndpoint,
): Promise<{ runtime: ScannedRuntime; models: ScannedModel[] } | null> {
    let tags: OllamaTag[];
    try {
        const data = (await getJson(`${endpoint.baseUrl}/api/tags`)) as {
            models?: unknown;
        };
        if (!Array.isArray(data.models)) return null;
        tags = data.models as OllamaTag[];
    } catch {
        return null;
    }

    const models = await Promise.all(
        tags.map(async (tag): Promise<ScannedModel | null> => {
            const name = tag.name ?? tag.model;
            if (!name) return null;
            const { capabilities, contextLength } = await ollamaShow(
                endpoint.baseUrl,
                name,
            );
            const families = [
                tag.details?.family ?? "",
                ...(tag.details?.families ?? []),
            ].join(" ");
            const isEmbedding = capabilities
                ? capabilities.includes("embedding") &&
                  !capabilities.includes("completion")
                : /bert/i.test(families) || looksLikeEmbeddingName(name);
            return {
                id: makeLocalModelId("ollama", endpoint.baseUrl, name),
                name,
                label: prettifyName(name),
                kind: "ollama",
                baseUrl: endpoint.baseUrl,
                sourceLabel: "Ollama",
                supportsTools: capabilities ? capabilities.includes("tools") : null,
                supportsThinking: capabilities
                    ? capabilities.includes("thinking")
                    : null,
                sizeBytes: typeof tag.size === "number" ? tag.size : null,
                parameterSize: tag.details?.parameter_size ?? null,
                quantization: tag.details?.quantization_level ?? null,
                family: tag.details?.family ?? null,
                contextLength,
                isEmbedding,
            };
        }),
    );

    const clean = models.filter((m): m is ScannedModel => m !== null);
    return {
        runtime: {
            baseUrl: endpoint.baseUrl,
            label: "Ollama",
            kind: "ollama",
            reachable: true,
            modelCount: clean.length,
        },
        models: clean,
    };
}

// ------------------------ LM Studio (rich listing) ------------------------

type LmStudioModel = {
    id?: string;
    type?: string; // "llm" | "vlm" | "embeddings"
    arch?: string;
    quantization?: string;
    state?: string; // "loaded" | "not-loaded"
    max_context_length?: number;
    capabilities?: string[];
};

async function scanLmStudio(
    endpoint: CandidateEndpoint,
): Promise<{ runtime: ScannedRuntime; models: ScannedModel[] } | null> {
    let list: LmStudioModel[];
    try {
        const data = (await getJson(`${endpoint.baseUrl}/api/v0/models`)) as {
            data?: unknown;
        };
        if (!Array.isArray(data.data)) return null;
        list = data.data as LmStudioModel[];
        // Must look like LM Studio's richer format, not a generic list.
        if (list.length && !list.some((m) => typeof m.type === "string")) {
            return null;
        }
    } catch {
        return null;
    }

    const models: ScannedModel[] = list
        .filter((m) => typeof m.id === "string" && m.id)
        .map((m) => {
            const name = m.id as string;
            const isEmbedding =
                m.type === "embeddings" || m.type === "embedding";
            return {
                id: makeLocalModelId("openai", endpoint.baseUrl, name),
                name,
                label: prettifyName(name),
                kind: "openai" as const,
                baseUrl: endpoint.baseUrl,
                sourceLabel: "LM Studio",
                supportsTools: Array.isArray(m.capabilities)
                    ? m.capabilities.includes("tool_use")
                    : null,
                supportsThinking: null,
                sizeBytes: null,
                parameterSize: null,
                quantization: m.quantization ?? null,
                family: m.arch ?? null,
                contextLength:
                    typeof m.max_context_length === "number"
                        ? m.max_context_length
                        : null,
                isEmbedding,
                loaded: m.state ? m.state === "loaded" : null,
            };
        });

    return {
        runtime: {
            baseUrl: endpoint.baseUrl,
            label: "LM Studio",
            kind: "openai",
            reachable: true,
            modelCount: models.length,
        },
        models,
    };
}

// --------------------- Generic OpenAI-compatible --------------------------

async function scanOpenAICompatible(
    endpoint: CandidateEndpoint,
): Promise<{ runtime: ScannedRuntime; models: ScannedModel[] } | null> {
    let list: { id?: unknown }[];
    try {
        const data = (await getJson(`${endpoint.baseUrl}/v1/models`)) as {
            data?: unknown;
            models?: unknown;
        };
        const arr = Array.isArray(data.data)
            ? data.data
            : Array.isArray(data.models)
              ? data.models
              : null;
        if (!arr) return null;
        list = arr as { id?: unknown }[];
    } catch {
        return null;
    }

    const models: ScannedModel[] = list
        .map((m) => (typeof m.id === "string" ? m.id : (m as { name?: unknown }).name))
        .filter((name): name is string => typeof name === "string" && !!name)
        .map((name) => ({
            id: makeLocalModelId("openai", endpoint.baseUrl, name),
            name,
            label: prettifyName(name),
            kind: "openai" as const,
            baseUrl: endpoint.baseUrl,
            sourceLabel: endpoint.label,
            supportsTools: null,
            supportsThinking: null,
            sizeBytes: null,
            parameterSize: null,
            quantization: null,
            family: null,
            contextLength: null,
            isEmbedding: looksLikeEmbeddingName(name),
        }));

    return {
        runtime: {
            baseUrl: endpoint.baseUrl,
            label: endpoint.label,
            kind: "openai",
            reachable: true,
            modelCount: models.length,
        },
        models,
    };
}

// -------------------------------- Scan ------------------------------------

async function scanEndpoint(
    endpoint: CandidateEndpoint,
): Promise<{ runtime: ScannedRuntime; models: ScannedModel[] }> {
    // Order matters: Ollama also serves /v1/models, and LM Studio also serves
    // the generic list, so try the most specific API first.
    const hit =
        (await scanOllama(endpoint)) ??
        (await scanLmStudio(endpoint)) ??
        (await scanOpenAICompatible(endpoint));
    if (hit) return hit;
    return {
        runtime: {
            baseUrl: endpoint.baseUrl,
            label: endpoint.label,
            kind: null,
            reachable: false,
            modelCount: 0,
            error: "Not running or not reachable",
        },
        models: [],
    };
}

export async function scanLocalModels(
    extraUrls: string[] = [],
): Promise<ScanResult> {
    const endpoints = defaultCandidateEndpoints();
    for (const raw of extraUrls) {
        const baseUrl = normalizeBaseUrl(raw);
        if (baseUrl && !endpoints.some((e) => e.baseUrl === baseUrl)) {
            endpoints.push({ baseUrl, label: "Custom server" });
        }
    }

    const results = await Promise.all(endpoints.map(scanEndpoint));

    // The same runtime can answer on two addresses (e.g. OLLAMA_BASE_URL and
    // the default). Keep the first copy of each model id.
    const seen = new Set<string>();
    const models: ScannedModel[] = [];
    for (const r of results) {
        for (const m of r.models) {
            if (seen.has(m.id)) continue;
            seen.add(m.id);
            models.push(m);
        }
    }

    models.sort((a, b) => {
        if (a.isEmbedding !== b.isEmbedding) return a.isEmbedding ? 1 : -1;
        if (a.sourceLabel !== b.sourceLabel) {
            return a.sourceLabel.localeCompare(b.sourceLabel);
        }
        return a.name.localeCompare(b.name);
    });

    return {
        scannedAt: new Date().toISOString(),
        runtimes: results.map((r) => r.runtime),
        models,
    };
}
