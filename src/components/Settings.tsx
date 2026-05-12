import { useState, useEffect } from "react";
import {
  Save, RefreshCw, AlertCircle, Trash2, Database,
  Settings as SettingsIcon, Globe, Server, Eye, EyeOff,
  Zap, Info, CheckCircle2, Cloud, HardDrive, Loader2
} from "lucide-react";
import { fetchModels, Provider, ModelInfo } from "../lib/api";
import { cacheDB } from "../lib/cache";
import { testSupabaseConnection } from "../lib/supabase";
import type { ImageInputMode } from "../lib/utils/types";


const MAKER_PRIORITY: Record<string, number> = {
  "google": 1,
  "openai": 2,
  "anthropic": 3,
  "meta-llama": 4,
  "mistralai": 5,
  "deepseek": 6,
  "microsoft": 7,
};

export function Settings() {
  const [settings, setSettings] = useState({
    provider: "ollama" as Provider,
    openRouterKey: "",
    ollamaUrl: "http://localhost:11434",
    googleApiKey: "",
    selectedModel: "",
    // Per-provider models
    googleModel: "",
    openRouterModel: "",
    ollamaModel: "",
    imageInputMode: "base64" as ImageInputMode,
    supabaseProjectId: "",
    supabaseServiceKey: "",
    supabaseBucket: "page-images",
  });
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<string>("Checking...");
  const [isClearing, setIsClearing] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showServiceKey, setShowServiceKey] = useState(false);
  const [supabaseTestStatus, setSupabaseTestStatus] = useState<
    { ok: boolean; message: string } | null
  >(null);
  const [isTestingSupabase, setIsTestingSupabase] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("pustakaku-settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
    updateCacheStatus();
  }, []);

  const updateCacheStatus = async () => {
    try {
      const sizeBytes = await cacheDB.calculateSize();
      if (sizeBytes === 0) {
        setCacheStatus("Cache is empty");
      } else if (sizeBytes < 1024) {
        setCacheStatus(`${sizeBytes} bytes`);
      } else if (sizeBytes < 1024 * 1024) {
        setCacheStatus(`${(sizeBytes / 1024).toFixed(1)} KB`);
      } else {
        setCacheStatus(`${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`);
      }
    } catch (e) {
      setCacheStatus("Unknown");
    }
  };

  const handleClearCache = async () => {
    if (!confirm("Are you sure you want to clear all cached images and results? This cannot be undone.")) return;
    setIsClearing(true);
    try {
      await cacheDB.clearAll();
      setCacheStatus("Cache Cleared");
      setTimeout(updateCacheStatus, 2000);
    } catch (e) {
      setError("Failed to clear cache");
    } finally {
      setIsClearing(false);
    }
  };

  const handleFetchModels = async () => {
    setIsLoadingModels(true);
    setError(null);
    try {
      const fetched = await fetchModels(settings.provider, {
        openRouterKey: settings.openRouterKey,
        ollamaUrl: settings.ollamaUrl,
        googleApiKey: settings.googleApiKey
      });
      setModels(fetched);
      if (fetched.length > 0 && (!settings.selectedModel || !fetched.find(m => m.id === settings.selectedModel))) {
        setSettings(prev => ({ ...prev, selectedModel: fetched[0].id }));
      }
    } catch (e: any) {
      setError(e.message || "Failed to fetch models");
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleSave = () => {
    localStorage.setItem("pustakaku-settings", JSON.stringify(settings));
    setIsSaved(true);
    setSupabaseTestStatus(null);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleTestSupabase = async () => {
    setIsTestingSupabase(true);
    setSupabaseTestStatus(null);
    try {
      const result = await testSupabaseConnection({
        url: `https://${settings.supabaseProjectId}.supabase.co`,
        serviceKey: settings.supabaseServiceKey,
        bucket: settings.supabaseBucket || "page-images",
      });
      setSupabaseTestStatus(result);
    } catch (e: any) {
      setSupabaseTestStatus({ ok: false, message: e.message || "Unknown error" });
    } finally {
      setIsTestingSupabase(false);
    }
  };

  const updateSetting = (key: keyof typeof settings, value: any) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      
      // Special logic for provider switching
      if (key === "provider") {
        if (value === "google") next.selectedModel = prev.googleModel || "";
        if (value === "openrouter") next.selectedModel = prev.openRouterModel || "";
        if (value === "ollama") next.selectedModel = prev.ollamaModel || "";
      }
      
      // Special logic for model selection
      if (key === "selectedModel") {
        if (prev.provider === "google") next.googleModel = value;
        if (prev.provider === "openrouter") next.openRouterModel = value;
        if (prev.provider === "ollama") next.ollamaModel = value;
      }
      
      return next;
    });
  };

  const getGroupedModels = () => {
    if (settings.provider === "ollama") {
      return { "Ollama (Local)": models.sort((a, b) => a.name.localeCompare(b.name)) };
    }

    const groups: Record<string, ModelInfo[]> = {};
    
    models.forEach(model => {
      let maker = "Other";
      if (model.id.includes("/")) {
        maker = model.id.split("/")[0];
      }
      
      if (!groups[maker]) groups[maker] = [];
      groups[maker].push(model);
    });

    // Sort models within each group
    Object.keys(groups).forEach(maker => {
      groups[maker].sort((a, b) => a.name.localeCompare(b.name));
    });

    // Sort categories
    const sortedMakers = Object.keys(groups).sort((a, b) => {
      const prioA = MAKER_PRIORITY[a.toLowerCase()] || 999;
      const prioB = MAKER_PRIORITY[b.toLowerCase()] || 999;
      
      if (prioA !== prioB) return prioA - prioB;
      return a.localeCompare(b);
    });

    const sortedGroups: Record<string, ModelInfo[]> = {};
    sortedMakers.forEach(maker => {
      sortedGroups[maker] = groups[maker];
    });

    return sortedGroups;
  };

  const groupedModels = getGroupedModels();

  const labelCls = "block text-[10px] font-bold text-muted-foreground mb-1.5 uppercase tracking-[0.1em]";
  const inputCls = "w-full px-3 py-2.5 bg-secondary text-foreground border border-border rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 placeholder:text-muted-foreground/50";

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      {/* Header Section */}
      <div className="flex items-center gap-3 mb-2 px-1">
        <div className="p-2 bg-primary/10 rounded-lg text-primary">
          <SettingsIcon size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold tracking-tight">App Settings</h2>
          <p className="text-xs text-muted-foreground">Configure your AI providers and application behavior.</p>
        </div>
      </div>

      <div className="grid gap-6">
        {/* API & Provider Section */}
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border bg-secondary/30 flex items-center gap-2">
            <Zap size={16} className="text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wider">AI Configuration</h3>
          </div>

          <div className="p-6 space-y-6">
            {/* Provider Toggle */}
            <div>
              <label className={labelCls}>Provider Selection</label>
              <div className="grid grid-cols-3 gap-2 p-1 bg-secondary/50 rounded-xl border border-border">
                <button
                  onClick={() => {
                    updateSetting("provider", "ollama");
                    updateSetting("imageInputMode", "base64");
                  }}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${settings.provider === "ollama" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Server size={14} />
                  Ollama
                </button>
                <button
                  onClick={() => {
                    updateSetting("provider", "openrouter");
                    if (settings.imageInputMode === "google_files") updateSetting("imageInputMode", "base64");
                  }}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${settings.provider === "openrouter" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Globe size={14} />
                  OpenRouter
                </button>
                <button
                  onClick={() => {
                    updateSetting("provider", "google");
                    if (settings.imageInputMode === "supabase") updateSetting("imageInputMode", "base64");
                  }}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${settings.provider === "google" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Zap size={14} />
                  Google
                </button>
              </div>
            </div>

            {/* Provider Specific Inputs */}
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              {settings.provider === "openrouter" ? (
                <div className="space-y-1.5">
                  <label className={labelCls}>OpenRouter API Key</label>
                  <div className="relative group">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={settings.openRouterKey}
                      onChange={e => updateSetting("openRouterKey", e.target.value)}
                      className={inputCls}
                      placeholder="sk-or-v1-..."
                    />
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-primary transition-colors"
                    >
                      {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                    <Info size={10} />
                    Your API key is stored locally in your browser's local storage.
                  </p>
                </div>
              ) : settings.provider === "google" ? (
                <div className="space-y-1.5">
                  <label className={labelCls}>Google AI Studio API Key</label>
                  <div className="relative group">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={settings.googleApiKey || ""}
                      onChange={e => updateSetting("googleApiKey", e.target.value)}
                      className={inputCls}
                      placeholder="AIzaSy..."
                    />
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-primary transition-colors"
                    >
                      {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                    <Info size={10} />
                    Your API key is stored locally in your browser's local storage.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className={labelCls}>Ollama Base URL</label>
                  <input
                    type="text"
                    value={settings.ollamaUrl}
                    onChange={e => updateSetting("ollamaUrl", e.target.value)}
                    className={inputCls}
                    placeholder="http://localhost:11434"
                  />
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                    <Info size={10} />
                    Ensure Ollama is running and OLLAMA_ORIGINS is configured if needed.
                  </p>
                </div>
              )}
            </div>

            {/* Image Upload Mode */}
            {(settings.provider === "openrouter" || settings.provider === "google") && (
              <div className="pt-2 space-y-4 animate-in fade-in duration-300">
                <div>
                  <label className={labelCls}>Image Input Mode</label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-secondary/50 rounded-xl border border-border">
                    <button
                      onClick={() => updateSetting("imageInputMode", "base64")}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${settings.imageInputMode === "base64"
                          ? "bg-background text-primary shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                      <HardDrive size={14} />
                      Base64 (Local)
                    </button>
                    {settings.provider === "openrouter" && (
                      <button
                        onClick={() => updateSetting("imageInputMode", "supabase")}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${settings.imageInputMode === "supabase"
                            ? "bg-background text-primary shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                          }`}
                      >
                        <Cloud size={14} />
                        Supabase URL
                      </button>
                    )}
                    {settings.provider === "google" && (
                      <button
                        onClick={() => updateSetting("imageInputMode", "google_files")}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${settings.imageInputMode === "google_files"
                            ? "bg-background text-primary shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                          }`}
                      >
                        <Cloud size={14} />
                        Google Files API
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground flex items-start gap-1 mt-2">
                    <Info size={10} className="shrink-0 mt-0.5" />
                    {settings.imageInputMode === "supabase"
                      ? "Images are uploaded to Supabase, a signed URL is sent to OpenRouter, then the file is deleted automatically."
                      : settings.imageInputMode === "google_files"
                      ? "Images are uploaded securely to Google's File API before extraction. (Better for large images)"
                      : "Images are encoded as base64 and sent inline. Simple, no external storage needed."}
                  </p>
                </div>

                {/* Supabase credentials — only shown when supabase mode is selected */}
                {settings.provider === "openrouter" && settings.imageInputMode === "supabase" && (
                  <div className="space-y-4 p-4 bg-secondary/20 rounded-xl border border-border animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-2 mb-1">
                      <Cloud size={14} className="text-primary" />
                      <span className="text-xs font-bold uppercase tracking-wider">Supabase Configuration</span>
                    </div>

                    {/* Project ID */}
                    <div className="space-y-1.5">
                      <label className={labelCls}>Project ID</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-mono select-none pointer-events-none">
                          https://
                        </span>
                        <input
                          type="text"
                          value={settings.supabaseProjectId}
                          onChange={e => updateSetting("supabaseProjectId", e.target.value.trim())}
                          className={inputCls + " pl-[62px] pr-[110px] font-mono"}
                          placeholder="abcdefghijklmnop"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-mono select-none pointer-events-none">
                          .supabase.co
                        </span>
                      </div>
                      {settings.supabaseProjectId && (
                        <p className="text-[10px] text-muted-foreground font-mono truncate">
                          → https://{settings.supabaseProjectId}.supabase.co
                        </p>
                      )}
                    </div>

                    {/* Service Role Key */}
                    <div className="space-y-1.5">
                      <label className={labelCls}>Service Role Key (Secret)</label>
                      <div className="relative group">
                        <input
                          type={showServiceKey ? "text" : "password"}
                          value={settings.supabaseServiceKey}
                          onChange={e => updateSetting("supabaseServiceKey", e.target.value)}
                          className={inputCls}
                          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                        />
                        <button
                          onClick={() => setShowServiceKey(!showServiceKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-primary transition-colors"
                        >
                          {showServiceKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Info size={10} />
                        Use the <strong>secret</strong> key, not the publishable key.
                      </p>
                    </div>

                    {/* Bucket Name */}
                    <div className="space-y-1.5">
                      <label className={labelCls}>Bucket Name</label>
                      <input
                        type="text"
                        value={settings.supabaseBucket}
                        onChange={e => updateSetting("supabaseBucket", e.target.value)}
                        className={inputCls}
                        placeholder="page-images"
                      />
                    </div>

                    {/* Test Connection */}
                    <div className="pt-1">
                      <button
                        onClick={handleTestSupabase}
                        disabled={
                          isTestingSupabase ||
                          !settings.supabaseProjectId ||
                          !settings.supabaseServiceKey
                        }
                        className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 transition-all text-xs font-bold uppercase tracking-wider disabled:opacity-40"
                      >
                        {isTestingSupabase ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Zap size={14} />
                        )}
                        {isTestingSupabase ? "Testing..." : "Test Connection"}
                      </button>

                      {supabaseTestStatus && (
                        <div className={`mt-3 flex items-start gap-2.5 p-3 rounded-lg text-xs border animate-in fade-in duration-200 ${supabaseTestStatus.ok
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-destructive/10 text-destructive border-destructive/20"
                          }`}>
                          {supabaseTestStatus.ok
                            ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                            : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
                          <span>{supabaseTestStatus.message}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Model Selection */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <label className={labelCls}>Vision Model</label>
                <button
                  onClick={handleFetchModels}
                  disabled={isLoadingModels || (settings.provider === "openrouter" && !settings.openRouterKey) || (settings.provider === "google" && !settings.googleApiKey)}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary hover:text-primary/80 disabled:opacity-40 transition-colors"
                >
                  <RefreshCw size={12} className={isLoadingModels ? "animate-spin" : ""} />
                  {isLoadingModels ? "Fetching..." : "Refresh List"}
                </button>
              </div>

              {models.length > 0 ? (
                <div className="relative">
                  <select
                    value={settings.selectedModel}
                    onChange={e => updateSetting("selectedModel", e.target.value)}
                    className={inputCls + " appearance-none cursor-pointer pr-10"}
                  >
                    {Object.entries(groupedModels).map(([maker, makerModels]) => (
                      <optgroup key={maker} label={maker.charAt(0).toUpperCase() + maker.slice(1)}>
                        {makerModels.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name.includes("/") ? m.name.split("/")[1] : m.name}
                            {m.capabilities.vision ? " (🖼️ Vision)" : ""}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                    <RefreshCw size={14} className="opacity-50" />
                  </div>
                </div>
              ) : (
                <div className="px-4 py-3 rounded-lg bg-secondary/30 border border-dashed border-border text-center">
                  <span className="text-xs text-muted-foreground italic">
                    Click "Refresh List" to load available models.
                  </span>
                </div>
              )}

              {error && (
                <div className="mt-3 flex items-start gap-2.5 p-3 bg-destructive/10 text-destructive rounded-lg text-xs border border-destructive/20 animate-in shake-200">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span className="font-medium leading-tight">{error}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Maintenance Section */}
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border bg-secondary/30 flex items-center gap-2">
            <Database size={16} className="text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wider">Maintenance</h3>
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="text-sm font-bold">Image & Markdown Cache</h4>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Storage used for rendered pages and extraction results to speed up navigation.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-secondary rounded text-muted-foreground">
                    Usage: {cacheStatus}
                  </span>
                </div>
              </div>
              <button
                onClick={handleClearCache}
                disabled={isClearing}
                className="flex items-center gap-2 px-4 py-2.5 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg hover:bg-destructive/20 transition-all text-xs font-bold uppercase tracking-wider disabled:opacity-50 group"
              >
                <Trash2 size={16} className="group-hover:animate-bounce" />
                <span>{isClearing ? "Clearing..." : "Clear Cache"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="sticky bottom-0 pt-6 pb-2 bg-linear-to-t from-background via-background/90 to-transparent z-10">
        <button
          onClick={handleSave}
          className={`w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-bold uppercase tracking-[0.2em] text-xs transition-all duration-300 shadow-xl ${isSaved
              ? "bg-emerald-500 text-white scale-[0.98] shadow-emerald-500/20"
              : "bg-primary text-primary-foreground hover:bg-primary/90 hover:-translate-y-0.5 shadow-primary/20 active:translate-y-0"
            }`}
        >
          {isSaved ? (
            <>
              <CheckCircle2 size={18} />
              <span>Settings Saved</span>
            </>
          ) : (
            <>
              <Save size={18} />
              <span>Save Configuration</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
