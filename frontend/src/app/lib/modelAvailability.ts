import { CLOUD_MODELS, type ModelGroup } from "./modelCatalog";
import { isLocalModelId } from "./localModels";

// "local" = any model the user enabled from their own computer.
export type ModelProvider = "claude" | "gemini" | "local";

export function getModelProvider(modelId: string): ModelProvider | null {
    if (isLocalModelId(modelId)) return "local";
    const model = CLOUD_MODELS.find((m) => m.id === modelId);
    if (!model) return null;
    return model.group === "Google" ? "gemini" : "claude";
}

export function isModelAvailable(
    modelId: string,
    apiKeys: { claudeApiKey: string | null; geminiApiKey: string | null },
): boolean {
    const provider = getModelProvider(modelId);
    if (!provider) return false;
    // Local models need no key. Claude can use the server's .env key.
    if (provider === "claude" || provider === "local") return true;
    return !!apiKeys.geminiApiKey?.trim();
}

export function isProviderAvailable(
    provider: ModelProvider,
    apiKeys: { claudeApiKey: string | null; geminiApiKey: string | null },
): boolean {
    if (provider === "claude" || provider === "local") return true;
    return !!apiKeys.geminiApiKey?.trim();
}

export function providerLabel(provider: ModelProvider): string {
    if (provider === "claude") return "Anthropic (Claude)";
    if (provider === "gemini") return "Google (Gemini)";
    return "Local model";
}

export function modelGroupToProvider(group: ModelGroup): ModelProvider {
    if (group === "Anthropic") return "claude";
    if (group === "Google") return "gemini";
    return "local";
}
