"use client";

import { useState } from "react";
import { ChevronDown, Check, AlertCircle, Search } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isModelAvailable } from "@/app/lib/modelAvailability";
import {
    GROUP_LABELS,
    GROUP_ORDER,
    useModelOptions,
} from "@/app/lib/modelCatalog";
import { LocalModelScanModal } from "@/app/components/models/LocalModelScanModal";

export type { ModelOption } from "@/app/lib/modelCatalog";
export { DEFAULT_MODEL_ID } from "@/app/lib/modelCatalog";

interface Props {
    value: string;
    onChange: (id: string) => void;
    apiKeys?: {
        claudeApiKey: string | null;
        geminiApiKey: string | null;
    };
}

export function ModelToggle({ value, onChange, apiKeys }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [scanOpen, setScanOpen] = useState(false);
    const { options, localModels } = useModelOptions();

    const selected = options.find((m) => m.id === value);
    const selectedLabel = selected?.label ?? "Model";
    const selectedAvailable = apiKeys ? isModelAvailable(value, apiKeys) : true;

    return (
        <>
            <DropdownMenu onOpenChange={setIsOpen}>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className={`flex items-center gap-1.5 rounded-lg px-2 h-8 text-sm transition-colors cursor-pointer text-gray-400 hover:bg-gray-100 hover:text-gray-700 ${isOpen ? "bg-gray-100 text-gray-700" : ""}`}
                        title={
                            !selectedAvailable
                                ? "API key missing for selected model"
                                : selected?.detail
                                  ? `${selected.label} (${selected.detail})`
                                  : "Choose model"
                        }
                    >
                        {!selectedAvailable && (
                            <AlertCircle className="h-3 w-3 shrink-0 text-red-500" />
                        )}
                        <span className="max-w-[160px] truncate">{selectedLabel}</span>
                        <ChevronDown
                            className={`h-3 w-3 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                        />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    className="w-64 z-50 max-h-[70vh] overflow-y-auto"
                    side="top"
                    align="start"
                >
                    {GROUP_ORDER.map((group, gi) => {
                        const items = options.filter((m) => m.group === group);
                        const isLocal = group === "Local";
                        if (items.length === 0 && !isLocal) return null;
                        return (
                            <div key={group}>
                                {gi > 0 && <DropdownMenuSeparator />}
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-gray-400">
                                    {GROUP_LABELS[group]}
                                </DropdownMenuLabel>
                                {isLocal && localModels.length === 0 && (
                                    <div className="px-2 pb-1 text-xs text-gray-400">
                                        No local models enabled yet.
                                    </div>
                                )}
                                {items.map((m) => {
                                    const available = apiKeys
                                        ? isModelAvailable(m.id, apiKeys)
                                        : true;
                                    return (
                                        <DropdownMenuItem
                                            key={m.id}
                                            className="cursor-pointer"
                                            onSelect={() => onChange(m.id)}
                                        >
                                            <span
                                                className={`flex-1 min-w-0 truncate ${available ? "" : "text-gray-400"}`}
                                            >
                                                {m.label}
                                                {m.detail && (
                                                    <span className="ml-1.5 text-[11px] text-gray-400">
                                                        {m.detail}
                                                    </span>
                                                )}
                                            </span>
                                            {!available && (
                                                <AlertCircle
                                                    className="h-3.5 w-3.5 text-red-500 ml-1"
                                                    aria-label="API key missing"
                                                />
                                            )}
                                            {m.id === value && available && (
                                                <Check className="h-3.5 w-3.5 text-gray-600 ml-1" />
                                            )}
                                        </DropdownMenuItem>
                                    );
                                })}
                                {isLocal && (
                                    <DropdownMenuItem
                                        className="cursor-pointer text-gray-600"
                                        onSelect={() => setScanOpen(true)}
                                    >
                                        <Search className="h-3.5 w-3.5" />
                                        <span className="flex-1">
                                            {localModels.length === 0
                                                ? "Scan for local models…"
                                                : "Scan / manage local models…"}
                                        </span>
                                    </DropdownMenuItem>
                                )}
                            </div>
                        );
                    })}
                </DropdownMenuContent>
            </DropdownMenu>
            <LocalModelScanModal open={scanOpen} onClose={() => setScanOpen(false)} />
        </>
    );
}
