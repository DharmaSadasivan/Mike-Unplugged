import { createServerSupabase } from "./supabase";
import {
    resolveModel,
    providerForModel,
    getEnabledLocalModels,
    isLocalModelId,
    DEFAULT_TITLE_MODEL,
    DEFAULT_TABULAR_MODEL,
    type UserApiKeys,
} from "./llm";

export type UserModelSettings = {
    title_model: string;
    tabular_model: string;
    api_keys: UserApiKeys;
};

/** Placeholder values from .env.example do not count as keys. */
function looksLikeRealKey(value: string | null | undefined): boolean {
    const v = value?.trim() ?? "";
    return v.length > 10 && !/^your[-_]/i.test(v);
}

/** True when a cloud provider can be called (user key or a real .env key). */
export function hasCloudKey(
    provider: "claude" | "gemini",
    apiKeys: UserApiKeys,
): boolean {
    if (provider === "claude") {
        return (
            looksLikeRealKey(apiKeys.claude) ||
            looksLikeRealKey(process.env.ANTHROPIC_API_KEY)
        );
    }
    return (
        looksLikeRealKey(apiKeys.gemini) ||
        looksLikeRealKey(process.env.GEMINI_API_KEY)
    );
}

function isUsable(model: string, apiKeys: UserApiKeys): boolean {
    try {
        const provider = providerForModel(model);
        return provider === "local" ? true : hasCloudKey(provider, apiKeys);
    } catch {
        return false;
    }
}

// Title generation is a lightweight task. Order of preference:
//   1. Gemini Flash Lite (if a Gemini key exists)
//   2. Claude Haiku (if a Claude key exists)
//   3. The user's first enabled local model (fully offline setups)
//   4. Claude Haiku (the upstream default)
function resolveTitleModel(apiKeys: UserApiKeys, firstLocal: string | null): string {
    if (looksLikeRealKey(apiKeys.gemini)) return "gemini-3.1-flash-lite-preview";
    if (looksLikeRealKey(apiKeys.claude)) return "claude-haiku-4-5";
    if (hasCloudKey("claude", apiKeys)) return "claude-haiku-4-5";
    if (hasCloudKey("gemini", apiKeys)) return "gemini-3.1-flash-lite-preview";
    if (firstLocal) return firstLocal;
    return DEFAULT_TITLE_MODEL;
}

export async function getUserModelSettings(
    userId: string,
    db?: ReturnType<typeof createServerSupabase>,
): Promise<UserModelSettings> {
    const client = db ?? createServerSupabase();
    const { data } = await client
        .from("user_profiles")
        .select("tabular_model, claude_api_key, gemini_api_key")
        .eq("user_id", userId)
        .single();

    const api_keys: UserApiKeys = {
        claude: data?.claude_api_key ?? null,
        gemini: data?.gemini_api_key ?? null,
    };

    const enabledLocal = await getEnabledLocalModels(userId, client);
    const firstLocal = enabledLocal[0]?.id ?? null;

    let tabular_model = resolveModel(data?.tabular_model, DEFAULT_TABULAR_MODEL);
    // A cloud model with no key cannot run. If the user has local models,
    // use one instead of failing the whole tabular review.
    if (!isUsable(tabular_model, api_keys) && firstLocal) {
        tabular_model = firstLocal;
    }
    // A local model that was disabled since it was chosen: fall back too.
    if (
        isLocalModelId(tabular_model) &&
        !enabledLocal.some((m) => m.id === tabular_model) &&
        firstLocal
    ) {
        tabular_model = firstLocal;
    }

    return {
        title_model: resolveTitleModel(api_keys, firstLocal),
        tabular_model,
        api_keys,
    };
}

export async function getUserApiKeys(
    userId: string,
    db?: ReturnType<typeof createServerSupabase>,
): Promise<UserApiKeys> {
    const client = db ?? createServerSupabase();
    const { data } = await client
        .from("user_profiles")
        .select("claude_api_key, gemini_api_key")
        .eq("user_id", userId)
        .single();
    return {
        claude: data?.claude_api_key ?? null,
        gemini: data?.gemini_api_key ?? null,
    };
}
