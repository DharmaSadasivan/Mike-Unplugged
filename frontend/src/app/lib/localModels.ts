// Types and helpers for models that run on the user's own computer
// (Ollama, LM Studio, llama.cpp, Jan, vLLM, ...). The backend finds them
// with a scan; the user ticks the ones to enable. Ids start with "local:".

export type LocalRuntimeKind = "ollama" | "openai";

export interface LocalModel {
    id: string;
    name: string;
    label: string;
    kind: LocalRuntimeKind;
    baseUrl: string;
    sourceLabel: string;
    supportsTools: boolean | null;
    supportsThinking?: boolean | null;
    sizeBytes?: number | null;
    parameterSize?: string | null;
    quantization?: string | null;
    family?: string | null;
    contextLength?: number | null;
}

export interface ScannedLocalModel extends LocalModel {
    isEmbedding: boolean;
    loaded?: boolean | null;
}

export interface ScannedRuntime {
    baseUrl: string;
    label: string;
    kind: LocalRuntimeKind | null;
    reachable: boolean;
    modelCount: number;
    error?: string;
}

export interface LocalScanResult {
    scannedAt: string;
    runtimes: ScannedRuntime[];
    models: ScannedLocalModel[];
}

export const LOCAL_MODEL_ID_PREFIX = "local:";

export function isLocalModelId(id: string | null | undefined): boolean {
    return typeof id === "string" && id.startsWith(LOCAL_MODEL_ID_PREFIX);
}

/** Keep only the fields we store (drops scan-only fields such as isEmbedding). */
export function toStoredLocalModel(m: LocalModel): LocalModel {
    return {
        id: m.id,
        name: m.name,
        label: m.label,
        kind: m.kind,
        baseUrl: m.baseUrl,
        sourceLabel: m.sourceLabel,
        supportsTools: m.supportsTools ?? null,
        supportsThinking: m.supportsThinking ?? null,
        sizeBytes: m.sizeBytes ?? null,
        parameterSize: m.parameterSize ?? null,
        quantization: m.quantization ?? null,
        family: m.family ?? null,
        contextLength: m.contextLength ?? null,
    };
}

export function parseStoredLocalModels(raw: unknown): LocalModel[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(
        (m): m is LocalModel =>
            !!m &&
            typeof m === "object" &&
            typeof (m as LocalModel).id === "string" &&
            isLocalModelId((m as LocalModel).id) &&
            typeof (m as LocalModel).label === "string",
    );
}

export function formatBytes(bytes: number | null | undefined): string | null {
    if (!bytes || bytes <= 0) return null;
    const gb = bytes / 1024 ** 3;
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    return `${Math.round(bytes / 1024 ** 2)} MB`;
}

/** Short one-line description, e.g. "8.2B · Q4_K_M · 4.8 GB". */
export function describeLocalModel(m: LocalModel): string {
    return [m.parameterSize, m.quantization, formatBytes(m.sizeBytes)]
        .filter(Boolean)
        .join(" · ");
}
