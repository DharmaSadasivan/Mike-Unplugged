"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    AlertTriangle,
    Check,
    Cpu,
    Loader2,
    RefreshCw,
    Search,
    X,
} from "lucide-react";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { scanLocalModels } from "@/app/lib/mikeApi";
import {
    describeLocalModel,
    type LocalModel,
    type LocalScanResult,
    type ScannedLocalModel,
} from "@/app/lib/localModels";

interface Props {
    open: boolean;
    onClose: () => void;
    /** Called after the user saves, with the models that are now enabled. */
    onSaved?: (models: LocalModel[]) => void;
}

/**
 * "Scan for local models" window.
 *  1. Checks this computer for running model apps (Ollama, LM Studio, ...).
 *  2. Lists every model found, with a tick box.
 *  3. Saves the ticked models; they then appear in every model menu.
 */
export function LocalModelScanModal({ open, onClose, onSaved }: Props) {
    const { profile, updateEnabledLocalModels } = useUserProfile();
    const enabled = useMemo(
        () => profile?.enabledLocalModels ?? [],
        [profile?.enabledLocalModels],
    );

    const [scan, setScan] = useState<LocalScanResult | null>(null);
    const [scanning, setScanning] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [customAddress, setCustomAddress] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    // Set the default ticks once per opening; later scans keep the user's choice.
    const ticksInitialized = useRef(false);

    const runScan = useCallback(
        async (address?: string) => {
            setScanning(true);
            setScanError(null);
            try {
                const result = await scanLocalModels(address);
                setScan(result);
                if (!ticksInitialized.current) {
                    ticksInitialized.current = true;
                    // Start from what is enabled today; on the very first
                    // scan, tick every chat model to save clicks.
                    setChecked(
                        enabled.length > 0
                            ? new Set(enabled.map((m) => m.id))
                            : new Set(
                                  result.models
                                      .filter((m) => !m.isEmbedding)
                                      .map((m) => m.id),
                              ),
                    );
                }
            } catch (err) {
                setScanError(
                    err instanceof Error && err.message
                        ? err.message
                        : "The scan did not finish.",
                );
            } finally {
                setScanning(false);
            }
        },
        [enabled],
    );

    // Scan as soon as the window opens.
    useEffect(() => {
        if (!open) return;
        ticksInitialized.current = false;
        setChecked(new Set());
        setSaveError(null);
        setScan(null);
        void runScan();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Models that are enabled but did not answer this scan (e.g. Ollama is
    // closed right now). We keep them listed so saving does not drop them.
    const offlineEnabled = useMemo(() => {
        if (!scan) return [];
        const found = new Set(scan.models.map((m) => m.id));
        return enabled.filter((m) => !found.has(m.id));
    }, [scan, enabled]);

    const chatModels = useMemo(
        () => scan?.models.filter((m) => !m.isEmbedding) ?? [],
        [scan],
    );
    const embeddingModels = useMemo(
        () => scan?.models.filter((m) => m.isEmbedding) ?? [],
        [scan],
    );
    const foundRuntimes = scan?.runtimes.filter((r) => r.reachable) ?? [];
    const missingRuntimes = scan?.runtimes.filter((r) => !r.reachable) ?? [];

    const toggle = (id: string) =>
        setChecked((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const selectAll = () =>
        setChecked(
            new Set([
                ...chatModels.map((m) => m.id),
                ...offlineEnabled.map((m) => m.id),
            ]),
        );
    const selectNone = () => setChecked(new Set());

    const handleSave = async () => {
        setSaving(true);
        setSaveError(null);
        const fromScan: LocalModel[] = chatModels.filter((m) => checked.has(m.id));
        const keptOffline = offlineEnabled.filter((m) => checked.has(m.id));
        const next = [...fromScan, ...keptOffline];
        const ok = await updateEnabledLocalModels(next);
        setSaving(false);
        if (!ok) {
            setSaveError("Could not save. Check that the Mike backend is running.");
            return;
        }
        onSaved?.(next);
        onClose();
    };

    if (!open) return null;

    const selectedCount =
        chatModels.filter((m) => checked.has(m.id)).length +
        offlineEnabled.filter((m) => checked.has(m.id)).length;

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/10 backdrop-blur-xs p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-xl max-h-[85vh] rounded-2xl bg-white shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="local-scan-title"
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-2">
                    <div>
                        <div className="flex items-center gap-2">
                            <Cpu className="h-4 w-4 text-gray-700" />
                            <h2
                                id="local-scan-title"
                                className="text-base font-medium text-gray-900"
                            >
                                Models on this computer
                            </h2>
                        </div>
                        <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                            Mike looks for model apps that are running on this
                            computer (Ollama, LM Studio, llama.cpp, Jan, vLLM
                            and others). Nothing is downloaded and nothing
                            leaves your computer. Tick the models you want to
                            use.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Runtime status */}
                <div className="px-5 pt-2 pb-3 flex flex-wrap items-center gap-1.5">
                    {scanning && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Scanning…
                        </span>
                    )}
                    {!scanning &&
                        foundRuntimes.map((r) => (
                            <span
                                key={r.baseUrl}
                                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700"
                                title={r.baseUrl}
                            >
                                <Check className="h-3 w-3" />
                                {r.label} · {r.modelCount}{" "}
                                {r.modelCount === 1 ? "model" : "models"}
                            </span>
                        ))}
                    {!scanning && scan && missingRuntimes.length > 0 && (
                        <span
                            className="text-[11px] text-gray-400"
                            title={missingRuntimes
                                .map((r) => `${r.label} (${r.baseUrl})`)
                                .join("\n")}
                        >
                            Not running: {missingRuntimes.map((r) => r.label).join(", ")}
                        </span>
                    )}
                </div>

                {/* Model list */}
                <div className="flex-1 overflow-y-auto border-y border-gray-100">
                    {scanError && (
                        <div className="m-5 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>
                                The scan did not work: {scanError}. Make sure the
                                Mike backend is running, then try again.
                            </span>
                        </div>
                    )}

                    {!scanning && scan && chatModels.length === 0 && offlineEnabled.length === 0 && !scanError && (
                        <div className="px-5 py-8 text-center">
                            <p className="text-sm text-gray-700">
                                No local models found.
                            </p>
                            <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                                Start your model app (for example, open Ollama
                                or start the LM Studio server), then click
                                Scan again. If your app uses a different
                                address, type it below.
                            </p>
                        </div>
                    )}

                    {(chatModels.length > 0 || offlineEnabled.length > 0) && (
                        <div className="flex items-center justify-between px-5 pt-3 pb-1">
                            <span className="text-[10px] uppercase tracking-wider text-gray-400">
                                Chat models
                            </span>
                            <span className="text-xs text-gray-500">
                                <button
                                    className="hover:text-gray-900 underline-offset-2 hover:underline"
                                    onClick={selectAll}
                                >
                                    Select all
                                </button>
                                <span className="mx-1.5 text-gray-300">|</span>
                                <button
                                    className="hover:text-gray-900 underline-offset-2 hover:underline"
                                    onClick={selectNone}
                                >
                                    None
                                </button>
                            </span>
                        </div>
                    )}

                    <ul className="px-2 pb-2">
                        {chatModels.map((m) => (
                            <ModelRow
                                key={m.id}
                                model={m}
                                checked={checked.has(m.id)}
                                onToggle={() => toggle(m.id)}
                            />
                        ))}
                        {offlineEnabled.map((m) => (
                            <ModelRow
                                key={m.id}
                                model={{ ...m, isEmbedding: false }}
                                checked={checked.has(m.id)}
                                onToggle={() => toggle(m.id)}
                                offline
                            />
                        ))}
                    </ul>

                    {embeddingModels.length > 0 && (
                        <div className="px-5 pb-4">
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
                                Not usable for chat
                            </p>
                            <p className="text-xs text-gray-400 leading-relaxed">
                                {embeddingModels.map((m) => m.label).join(", ")}{" "}
                                {embeddingModels.length === 1 ? "is an" : "are"}{" "}
                                embedding{" "}
                                {embeddingModels.length === 1 ? "model" : "models"}{" "}
                                (they turn text into numbers for search and cannot
                                write answers).
                            </p>
                        </div>
                    )}
                </div>

                {/* Custom address */}
                <div className="px-5 pt-3">
                    <label className="text-xs text-gray-500 block mb-1">
                        Model app at a different address? (optional)
                    </label>
                    <div className="flex gap-2">
                        <input
                            value={customAddress}
                            onChange={(e) => setCustomAddress(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") void runScan(customAddress);
                            }}
                            placeholder="e.g. http://192.168.1.20:11434"
                            className="flex-1 h-8 rounded-md border border-gray-300 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                            spellCheck={false}
                            autoComplete="off"
                        />
                        <button
                            onClick={() => void runScan(customAddress)}
                            disabled={scanning}
                            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 h-8 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            {scanning ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : scan ? (
                                <RefreshCw className="h-3.5 w-3.5" />
                            ) : (
                                <Search className="h-3.5 w-3.5" />
                            )}
                            {scan ? "Scan again" : "Scan"}
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-2 px-5 pb-5 pt-4">
                    <span className="text-xs text-red-600">{saveError}</span>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="rounded-lg px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || scanning || !scan}
                            className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                        >
                            {saving
                                ? "Saving…"
                                : selectedCount === 0
                                  ? "Save (no local models)"
                                  : `Enable ${selectedCount} ${selectedCount === 1 ? "model" : "models"}`}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}

function ModelRow({
    model,
    checked,
    onToggle,
    offline = false,
}: {
    model: ScannedLocalModel | (LocalModel & { isEmbedding: boolean });
    checked: boolean;
    onToggle: () => void;
    offline?: boolean;
}) {
    const detail = describeLocalModel(model);
    return (
        <li>
            <label className="flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-gray-50 cursor-pointer">
                <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-gray-900 cursor-pointer"
                    checked={checked}
                    onChange={onToggle}
                />
                <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm text-gray-900 truncate">
                            {model.label}
                        </span>
                        <span className="text-[11px] text-gray-400">
                            {model.sourceLabel}
                        </span>
                        {model.supportsThinking && <Badge>Reasoning</Badge>}
                        {model.supportsTools === true && <Badge>Tools</Badge>}
                        {offline && <Badge tone="amber">Not running now</Badge>}
                    </span>
                    {(detail || model.name !== model.label) && (
                        <span className="block text-[11px] text-gray-400 truncate">
                            {[model.name !== model.label ? model.name : null, detail]
                                .filter(Boolean)
                                .join(" · ")}
                        </span>
                    )}
                </span>
            </label>
        </li>
    );
}

function Badge({
    children,
    tone = "gray",
}: {
    children: React.ReactNode;
    tone?: "gray" | "amber";
}) {
    const cls =
        tone === "amber"
            ? "bg-amber-50 text-amber-700"
            : "bg-gray-100 text-gray-600";
    return (
        <span className={`rounded px-1.5 py-px text-[10px] font-medium ${cls}`}>
            {children}
        </span>
    );
}
