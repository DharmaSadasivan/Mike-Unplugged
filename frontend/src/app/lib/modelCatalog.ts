"use client";

// One place that answers "which models can the user pick right now?"
// Cloud models are fixed. Local models come from the user's own scan.

import { useMemo } from "react";
import { useUserProfile } from "@/contexts/UserProfileContext";
import type { LocalModel } from "./localModels";

export type ModelGroup = "Anthropic" | "Google" | "Local";

export interface ModelOption {
    id: string;
    label: string;
    group: ModelGroup;
    /** Extra grey text, e.g. "Ollama" or "LM Studio" for local models. */
    detail?: string;
}

export const CLOUD_MODELS: ModelOption[] = [
    { id: "claude-opus-4-7", label: "Claude Opus 4.7", group: "Anthropic" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", group: "Anthropic" },
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", group: "Google" },
    { id: "gemini-3-flash-preview", label: "Gemini 3 Flash", group: "Google" },
];

export const CLOUD_MODEL_IDS = new Set(CLOUD_MODELS.map((m) => m.id));

export const DEFAULT_MODEL_ID = "claude-sonnet-4-6";

export const GROUP_ORDER: ModelGroup[] = ["Local", "Anthropic", "Google"];

export const GROUP_LABELS: Record<ModelGroup, string> = {
    Local: "On this computer",
    Anthropic: "Anthropic",
    Google: "Google",
};

export function localModelToOption(m: LocalModel): ModelOption {
    return {
        id: m.id,
        label: m.label,
        group: "Local",
        detail: m.sourceLabel,
    };
}

export function buildModelOptions(localModels: LocalModel[]): ModelOption[] {
    return [...localModels.map(localModelToOption), ...CLOUD_MODELS];
}

/** All models the user can choose: enabled local models + cloud models. */
export function useModelOptions(): {
    options: ModelOption[];
    localModels: LocalModel[];
    profileLoaded: boolean;
} {
    const { profile } = useUserProfile();
    const localModels = useMemo(
        () => profile?.enabledLocalModels ?? [],
        [profile?.enabledLocalModels],
    );
    const options = useMemo(() => buildModelOptions(localModels), [localModels]);
    return { options, localModels, profileLoaded: !!profile };
}

/**
 * The model to use when nothing valid is selected. Local-first: if the user
 * has no Claude key but has enabled a local model, use the local model.
 */
export function pickDefaultModel(
    localModels: LocalModel[],
    claudeApiKey: string | null | undefined,
): string {
    if (!claudeApiKey?.trim() && localModels.length > 0) {
        return localModels[0].id;
    }
    return DEFAULT_MODEL_ID;
}
