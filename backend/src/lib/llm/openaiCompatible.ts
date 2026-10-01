// ---------------------------------------------------------------------------
// OpenAI-compatible local runtimes (LM Studio, llama.cpp, Jan, vLLM, ...)
// ---------------------------------------------------------------------------
// These servers all speak POST /v1/chat/completions with Server-Sent Events.
// Mike's tool loop is the same as for Ollama: stream a turn, run any tool
// calls, feed the results back, repeat until the model answers in text.

import type {
    NormalizedToolCall,
    OpenAIToolSchema,
    StreamChatParams,
    StreamChatResult,
} from "./types";

type ChatMessage =
    | { role: "system" | "user"; content: string }
    | {
          role: "assistant";
          content: string | null;
          tool_calls?: {
              id: string;
              type: "function";
              function: { name: string; arguments: string };
          }[];
      }
    | { role: "tool"; tool_call_id: string; content: string };

export type OpenAICompatibleTarget = {
    baseUrl: string;
    model: string;
    /** false = never send tools; null/true = try, and fall back if refused. */
    supportsTools: boolean | null;
};

function isToolsRejected(status: number, body: string): boolean {
    return (
        (status === 400 || status === 422 || status === 500) &&
        /tool|function/i.test(body)
    );
}

async function postChat(
    target: OpenAICompatibleTarget,
    body: Record<string, unknown>,
): Promise<Response> {
    return fetch(`${target.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            // Local servers ignore this, but some proxies require a header.
            Authorization: "Bearer local",
        },
        body: JSON.stringify({ model: target.model, ...body }),
    });
}

export async function streamOpenAICompatible(
    params: StreamChatParams,
    target: OpenAICompatibleTarget,
): Promise<StreamChatResult> {
    const { systemPrompt, callbacks = {}, runTools } = params;
    const maxIter = params.maxIterations ?? 10;
    let tools: OpenAIToolSchema[] =
        target.supportsTools === false ? [] : (params.tools ?? []);

    const messages: ChatMessage[] = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    for (const m of params.messages) {
        messages.push({ role: m.role, content: m.content });
    }

    let fullText = "";

    for (let iter = 0; iter < maxIter; iter++) {
        let response = await postChat(target, {
            messages,
            stream: true,
            ...(tools.length ? { tools, tool_choice: "auto" } : {}),
        });

        if (!response.ok && tools.length) {
            const errText = await response.text();
            if (isToolsRejected(response.status, errText)) {
                // Model/server has no tool support: carry on as plain chat.
                console.warn(
                    `[local:${target.model}] tools rejected, retrying without tools`,
                );
                tools = [];
                response = await postChat(target, { messages, stream: true });
            } else {
                throw new Error(
                    `Local model server error (${response.status}): ${errText}`,
                );
            }
        }
        if (!response.ok) {
            throw new Error(
                `Local model server error (${response.status}): ${await response.text()}`,
            );
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream from local model server");
        const decoder = new TextDecoder();

        let buffer = "";
        let sawReasoning = false;
        const pending = new Map<
            number,
            { id: string; name: string; args: string }
        >();

        const handleEvent = (payload: string) => {
            if (payload === "[DONE]") return;
            let parsed: {
                choices?: {
                    delta?: {
                        content?: string | null;
                        reasoning_content?: string | null;
                        reasoning?: string | null;
                        tool_calls?: {
                            index?: number;
                            id?: string;
                            function?: { name?: string; arguments?: string };
                        }[];
                    };
                }[];
            };
            try {
                parsed = JSON.parse(payload);
            } catch {
                return;
            }
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) return;

            const reasoning = delta.reasoning_content ?? delta.reasoning;
            if (reasoning) {
                sawReasoning = true;
                callbacks.onReasoningDelta?.(reasoning);
            }
            if (delta.content) {
                fullText += delta.content;
                callbacks.onContentDelta?.(delta.content);
            }
            for (const tc of delta.tool_calls ?? []) {
                const idx = tc.index ?? 0;
                const cur = pending.get(idx) ?? {
                    id: tc.id || `call_${Math.random().toString(36).slice(2, 11)}`,
                    name: "",
                    args: "",
                };
                if (tc.id) cur.id = tc.id;
                if (tc.function?.name) cur.name += tc.function.name;
                if (tc.function?.arguments) cur.args += tc.function.arguments;
                pending.set(idx, cur);
            }
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const raw of lines) {
                const line = raw.trim();
                if (line.startsWith("data:")) handleEvent(line.slice(5).trim());
            }
        }
        const tail = buffer.trim();
        if (tail.startsWith("data:")) handleEvent(tail.slice(5).trim());

        if (sawReasoning) callbacks.onReasoningBlockEnd?.();

        const toolCalls: NormalizedToolCall[] = [];
        for (const call of pending.values()) {
            if (!call.name) continue;
            let input: Record<string, unknown> = {};
            try {
                input = JSON.parse(call.args || "{}");
            } catch {
                console.error("[local] could not parse tool arguments:", call.args);
            }
            const normalized = { id: call.id, name: call.name, input };
            callbacks.onToolCallStart?.(normalized);
            toolCalls.push(normalized);
        }

        if (!toolCalls.length || !runTools) break;

        const results = await runTools(toolCalls);
        messages.push({
            role: "assistant",
            content: null,
            tool_calls: toolCalls.map((c) => ({
                id: c.id,
                type: "function",
                function: { name: c.name, arguments: JSON.stringify(c.input) },
            })),
        });
        for (const r of results) {
            messages.push({
                role: "tool",
                tool_call_id: r.tool_use_id,
                content:
                    typeof r.content === "string"
                        ? r.content
                        : JSON.stringify(r.content),
            });
        }
    }

    return { fullText };
}

export async function completeOpenAICompatibleText(
    params: { systemPrompt?: string; user: string; maxTokens?: number },
    target: OpenAICompatibleTarget,
): Promise<string> {
    const messages: ChatMessage[] = [];
    if (params.systemPrompt) {
        messages.push({ role: "system", content: params.systemPrompt });
    }
    messages.push({ role: "user", content: params.user });

    const response = await postChat(target, {
        messages,
        // No max_tokens: reasoning models would be cut off mid-thought.
        stream: false,
    });
    if (!response.ok) {
        throw new Error(
            `Local model server error (${response.status}): ${await response.text()}`,
        );
    }
    const data = (await response.json()) as {
        choices?: { message?: { content?: string | null } }[];
    };
    return stripThinkTags(data.choices?.[0]?.message?.content ?? "");
}

/** Reasoning models sometimes put their thinking inline; drop it for one-shot text. */
export function stripThinkTags(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}
