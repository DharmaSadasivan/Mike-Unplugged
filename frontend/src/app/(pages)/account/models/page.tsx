"use client";

import { useEffect, useState } from "react";
import {
    AlertCircle,
    Check,
    ChevronDown,
    Cpu,
    Eye,
    EyeOff,
    Search,
    X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUserProfile } from "@/contexts/UserProfileContext";
import {
    isModelAvailable,
    modelGroupToProvider,
} from "@/app/lib/modelAvailability";
import {
    GROUP_LABELS,
    GROUP_ORDER,
    useModelOptions,
} from "@/app/lib/modelCatalog";
import { describeLocalModel } from "@/app/lib/localModels";
import { LocalModelScanModal } from "@/app/components/models/LocalModelScanModal";

export default function ModelsAndApiKeysPage() {
    const { profile, updateModelPreference, updateApiKey } = useUserProfile();

    return (
        <div className="space-y-4">
            <LocalModelsSection />

            {/* Model Preferences */}
            <div className="pb-6">
                <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-2xl font-medium font-serif">
                        Model Preferences
                    </h2>
                </div>
                <div className="space-y-4 max-w-md">
                    <div>
                        <label className="text-sm text-gray-600 block mb-2">
                            Tabular review model
                        </label>
                        <TabularModelDropdown
                            value={
                                profile?.tabularModel ??
                                "claude-sonnet-4-6"
                            }
                            apiKeys={{
                                claudeApiKey: profile?.claudeApiKey ?? null,
                                geminiApiKey: profile?.geminiApiKey ?? null,
                            }}
                            onChange={(id) =>
                                updateModelPreference("tabularModel", id)
                            }
                        />
                    </div>
                </div>
            </div>

            {/* API Keys */}
            <div className="py-6">
                <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-2xl font-medium font-serif">
                        API Keys
                    </h2>
                </div>
                <p className="text-sm text-gray-500 mb-4 max-w-xl">
                    API keys are optional. You only need them if you want to
                    use cloud models (Claude or Gemini). With local models
                    only, leave these empty.
                </p>
                <p className="text-xs text-gray-400 mb-4 max-w-xl">
                    Chat titles use Gemini Flash Lite or Claude Haiku when you
                    add a key. With no keys, Mike uses your first enabled local
                    model.
                </p>
                <div className="space-y-4 max-w-xl">
                    <ApiKeyField
                        label="Anthropic (Claude) API Key"
                        placeholder="sk-ant-…"
                        initialValue={profile?.claudeApiKey ?? ""}
                        onSave={(value) =>
                            updateApiKey("claude", value.trim() || null)
                        }
                    />
                    <ApiKeyField
                        label="Google (Gemini) API Key"
                        placeholder="AI…"
                        initialValue={profile?.geminiApiKey ?? ""}
                        onSave={(value) =>
                            updateApiKey("gemini", value.trim() || null)
                        }
                    />
                </div>
            </div>
        </div>
    );
}

function LocalModelsSection() {
    const { profile, updateEnabledLocalModels } = useUserProfile();
    const [scanOpen, setScanOpen] = useState(false);
    const models = profile?.enabledLocalModels ?? [];

    const removeModel = async (id: string) => {
        const ok = await updateEnabledLocalModels(
            models.filter((m) => m.id !== id),
        );
        if (!ok) alert("Could not remove the model.");
    };

    return (
        <div className="pb-6">
            <div className="flex items-center justify-between gap-2 mb-2 max-w-xl">
                <h2 className="text-2xl font-medium font-serif">Local Models</h2>
                <Button
                    onClick={() => setScanOpen(true)}
                    className="bg-black hover:bg-gray-900 text-white"
                >
                    <Search className="h-4 w-4" />
                    Scan this computer
                </Button>
            </div>
            <p className="text-sm text-gray-500 mb-4 max-w-xl">
                Use models that run on your own computer. Nothing you type
                leaves this machine. Mike finds models in Ollama, LM Studio,
                llama.cpp, Jan, vLLM and other OpenAI-compatible apps. Start
                your model app, then click Scan this computer.
            </p>
            {models.length === 0 ? (
                <div className="max-w-xl rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">
                    No local models enabled yet.
                </div>
            ) : (
                <ul className="max-w-xl divide-y divide-gray-100 rounded-lg border border-gray-200">
                    {models.map((m) => {
                        const detail = describeLocalModel(m);
                        return (
                            <li
                                key={m.id}
                                className="flex items-center gap-3 px-3 py-2"
                            >
                                <Cpu className="h-4 w-4 shrink-0 text-gray-400" />
                                <span className="flex-1 min-w-0">
                                    <span className="block text-sm text-gray-900 truncate">
                                        {m.label}
                                        <span className="ml-1.5 text-[11px] text-gray-400">
                                            {m.sourceLabel}
                                        </span>
                                    </span>
                                    <span className="block text-[11px] text-gray-400 truncate">
                                        {[detail, m.baseUrl].filter(Boolean).join(" · ")}
                                    </span>
                                </span>
                                <button
                                    onClick={() => void removeModel(m.id)}
                                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                    aria-label={`Disable ${m.label}`}
                                    title="Disable this model"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
            <LocalModelScanModal open={scanOpen} onClose={() => setScanOpen(false)} />
        </div>
    );
}

function TabularModelDropdown({
    value,
    onChange,
    apiKeys,
}: {
    value: string;
    onChange: (id: string) => void;
    apiKeys: { claudeApiKey: string | null; geminiApiKey: string | null };
}) {
    const [isOpen, setIsOpen] = useState(false);
    const { options } = useModelOptions();
    const selected = options.find((m) => m.id === value);
    const selectedAvailable = isModelAvailable(value, apiKeys);

    return (
        <DropdownMenu onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-sm shadow-sm flex items-center justify-between gap-2 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black/10"
                >
                    <span className="flex items-center gap-2 min-w-0">
                        {!selectedAvailable && (
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                        )}
                        <span className="truncate text-gray-900">
                            {selected?.label ?? "Select a model"}
                        </span>
                    </span>
                    <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                className="z-50"
                style={{ width: "var(--radix-dropdown-menu-trigger-width)" }}
                align="start"
            >
                {GROUP_ORDER.map((group, gi) => {
                    const items = options.filter((m) => m.group === group);
                    if (items.length === 0) return null;
                    return (
                        <div key={group}>
                            {gi > 0 && <DropdownMenuSeparator />}
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-gray-400">
                                {GROUP_LABELS[group]}
                            </DropdownMenuLabel>
                            {items.map((m) => {
                                const provider = modelGroupToProvider(m.group);
                                const available = isModelAvailable(
                                    m.id,
                                    apiKeys,
                                );
                                return (
                                    <DropdownMenuItem
                                        key={m.id}
                                        className="cursor-pointer"
                                        onSelect={() => onChange(m.id)}
                                        title={
                                            !available
                                                ? `Add a ${provider === "claude" ? "Claude" : "Gemini"} API key to use this model`
                                                : undefined
                                        }
                                    >
                                        <span
                                            className={`flex-1 ${available ? "" : "text-gray-400"}`}
                                        >
                                            {m.label}
                                            {m.detail && (
                                                <span className="ml-1.5 text-[11px] text-gray-400">
                                                    {m.detail}
                                                </span>
                                            )}
                                        </span>
                                        {!available && (
                                            <AlertCircle className="h-3.5 w-3.5 text-red-500 ml-1" />
                                        )}
                                        {m.id === value && available && (
                                            <Check className="h-3.5 w-3.5 text-gray-600 ml-1" />
                                        )}
                                    </DropdownMenuItem>
                                );
                            })}
                        </div>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function ApiKeyField({
    label,
    placeholder,
    initialValue,
    onSave,
}: {
    label: string;
    placeholder: string;
    initialValue: string;
    onSave: (value: string) => Promise<boolean>;
}) {
    const [value, setValue] = useState(initialValue);
    const [reveal, setReveal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    const dirty = value !== initialValue;

    const handleSave = async () => {
        setIsSaving(true);
        const ok = await onSave(value);
        setIsSaving(false);
        if (ok) {
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } else {
            alert(`Failed to save ${label}.`);
        }
    };

    return (
        <div>
            <label className="text-sm text-gray-600 block mb-2">{label}</label>
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Input
                        type={reveal ? "text" : "password"}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder={placeholder}
                        className="pr-10"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <button
                        type="button"
                        onClick={() => setReveal((r) => !r)}
                        className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600"
                        aria-label={reveal ? "Hide key" : "Show key"}
                    >
                        {reveal ? (
                            <EyeOff className="h-4 w-4" />
                        ) : (
                            <Eye className="h-4 w-4" />
                        )}
                    </button>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={isSaving || !dirty || saved}
                    className="min-w-[80px] transition-all bg-black hover:bg-gray-900 text-white"
                >
                    {isSaving ? (
                        "Saving..."
                    ) : saved ? (
                        <>
                            <Check className="h-4 w-3" />
                            Saved
                        </>
                    ) : (
                        "Save"
                    )}
                </Button>
            </div>
        </div>
    );
}
