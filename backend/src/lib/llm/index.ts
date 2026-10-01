import { streamClaude, completeClaudeText } from "./claude";
import { streamGemini, completeGeminiText } from "./gemini";
import { streamOllama, completeOllamaText } from "./ollama";
import {
    streamOpenAICompatible,
    completeOpenAICompatibleText,
} from "./openaiCompatible";
import { resolveLocalTarget } from "./localModels";
import { providerForModel } from "./models";
import type { StreamChatParams, StreamChatResult, UserApiKeys } from "./types";

export * from "./types";
export * from "./models";
export * from "./localModels";

/** Turn low-level network errors into a message a user can act on. */
function describeLocalFailure(modelId: string, baseUrl: string, err: unknown): Error {
    const msg = err instanceof Error ? err.message : String(err);
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH/i.test(msg)) {
        return new Error(
            `Could not reach the local model server at ${baseUrl}. ` +
                `Make sure it is running (for Ollama: open the Ollama app), ` +
                `then try again. Model: ${modelId}`,
        );
    }
    if (/local model server/i.test(msg)) return err instanceof Error ? err : new Error(msg);
    return new Error(
        `The local model server at ${baseUrl} returned an error for ${modelId}: ${msg}`,
    );
}

export async function streamChatWithTools(
    params: StreamChatParams,
): Promise<StreamChatResult> {
    const provider = providerForModel(params.model);
    if (provider === "claude") return streamClaude(params);
    if (provider === "gemini") return streamGemini(params);

    const target = await resolveLocalTarget(params.model);
    try {
        if (target.kind === "ollama") {
            return await streamOllama(params, {
                baseUrl: target.baseUrl,
                model: target.name,
                supportsTools: target.supportsTools,
            });
        }
        return await streamOpenAICompatible(params, {
            baseUrl: target.baseUrl,
            model: target.name,
            supportsTools: target.supportsTools,
        });
    } catch (err) {
        throw describeLocalFailure(params.model, target.baseUrl, err);
    }
}

export async function completeText(params: {
    model: string;
    systemPrompt?: string;
    user: string;
    maxTokens?: number;
    apiKeys?: UserApiKeys;
}): Promise<string> {
    const provider = providerForModel(params.model);
    if (provider === "claude") return completeClaudeText(params);
    if (provider === "gemini") return completeGeminiText(params);

    const target = await resolveLocalTarget(params.model);
    const local = {
        baseUrl: target.baseUrl,
        model: target.name,
        supportsTools: target.supportsTools,
    };
    try {
        if (target.kind === "ollama") return await completeOllamaText(params, local);
        return await completeOpenAICompatibleText(params, local);
    } catch (err) {
        throw describeLocalFailure(params.model, target.baseUrl, err);
    }
}
