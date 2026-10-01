"use client";

import { useCallback, useEffect, useState } from "react";
import { useUserProfile } from "@/contexts/UserProfileContext";
import {
    CLOUD_MODEL_IDS,
    DEFAULT_MODEL_ID,
    pickDefaultModel,
} from "../lib/modelCatalog";
import { isLocalModelId } from "../lib/localModels";

const STORAGE_KEY = "mike.selectedModel";

function readStored(): string | null {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

function writeStored(id: string): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
        /* storage unavailable: selection just won't be remembered */
    }
}

/**
 * The chat model picked in the model menu. Local models are only valid while
 * they are enabled; if one is disabled (or was never enabled on this
 * computer) we fall back to a sensible default.
 */
export function useSelectedModel(): [string, (id: string) => void] {
    const { profile } = useUserProfile();
    const [model, setModelState] = useState<string>(DEFAULT_MODEL_ID);

    const enabledLocal = profile?.enabledLocalModels;
    const claudeKey = profile?.claudeApiKey;

    useEffect(() => {
        // Wait for the profile so we know which local models exist.
        if (!profile) return;
        const local = enabledLocal ?? [];
        const stored = readStored();
        const valid =
            !!stored &&
            (CLOUD_MODEL_IDS.has(stored) ||
                (isLocalModelId(stored) && local.some((m) => m.id === stored)));
        setModelState(valid ? (stored as string) : pickDefaultModel(local, claudeKey));
    }, [profile, enabledLocal, claudeKey]);

    const setModel = useCallback(
        (id: string) => {
            const local = enabledLocal ?? [];
            const ok =
                CLOUD_MODEL_IDS.has(id) ||
                (isLocalModelId(id) && local.some((m) => m.id === id));
            const next = ok ? id : pickDefaultModel(local, claudeKey);
            setModelState(next);
            writeStored(next);
        },
        [enabledLocal, claudeKey],
    );

    return [model, setModel];
}
