// Keeps the settings drawer LM Studio-only so the UI no longer exposes legacy secondary-provider paths.
import { useState, useEffect, useCallback } from "react";
import { View, Text, TextInput, Pressable, Modal, Platform, ScrollView } from "react-native";
import { X, Settings, Wifi, WifiOff, Server, RefreshCw, ChevronDown, Trash2, Copy, AlertTriangle, Info } from "lucide-react-native";
import { apiClient, type LmModel } from "@/shared/lib/api-client";
import { mixedStyle } from "@/shared/lib/web-styles";
import { useSettingsStore } from "@/stores/settings-store";
import { useProjectStore } from "@/stores/project-store";

interface SettingsDrawerProps {
  visible: boolean;
  onClose: () => void;
}

const SettingsDrawer = ({ visible, onClose }: SettingsDrawerProps) => {
  const lmStudioUrl = useSettingsStore((state) => state.lmStudioUrl);
  const setLmStudioUrl = useSettingsStore((state) => state.setLmStudioUrl);
  const model = useSettingsStore((state) => state.model);
  const setModel = useSettingsStore((state) => state.setModel);
  const temperature = useSettingsStore((state) => state.temperature);
  const setTemperature = useSettingsStore((state) => state.setTemperature);
  const maxTokens = useSettingsStore((state) => state.maxTokens);
  const setMaxTokens = useSettingsStore((state) => state.setMaxTokens);
  const agentUrl = useSettingsStore((state) => state.agentUrl);
  const setAgentUrl = useSettingsStore((state) => state.setAgentUrl);
  const plannerModel = useSettingsStore((state) => state.plannerModel);
  const setPlannerModel = useSettingsStore((state) => state.setPlannerModel);
  const enhancerModel = useSettingsStore((state) => state.enhancerModel);
  const setEnhancerModel = useSettingsStore((state) => state.setEnhancerModel);
  const enhancerEnabled = useSettingsStore((state) => state.enhancerEnabled);
  const setEnhancerEnabled = useSettingsStore((state) => state.setEnhancerEnabled);
  const lmStatus = useProjectStore((s) => s.lmStudioStatus);
  const isConnected = useProjectStore((s) => s.isConnected);

  const [models, setModels] = useState<LmModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [plannerDropdownOpen, setPlannerDropdownOpen] = useState(false);
  const [enhancerDropdownOpen, setEnhancerDropdownOpen] = useState(false);

  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      setModels(await apiClient.listLmStudioModels());
    } catch {
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, []);

  // Debounce URL changes to avoid spamming fetch on each keystroke
  const [debouncedUrl, setDebouncedUrl] = useState(lmStudioUrl);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedUrl(lmStudioUrl), 500);
    return () => clearTimeout(timer);
  }, [lmStudioUrl]);

  useEffect(() => {
    if (visible) void fetchModels().catch(() => {});
  }, [visible, debouncedUrl, fetchModels]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable className="flex-1" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onPress={onClose} />
      <View
        className="absolute bottom-0 left-0 right-0 rounded-t-3xl"
        style={mixedStyle({
          backgroundColor: "rgba(18, 18, 31, 0.95)",
          ...(Platform.OS === "web"
            ? { backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }
            : {}),
          borderTopWidth: 1,
          borderTopColor: "rgba(255,215,0,0.15)",
          maxHeight: "80%",
        })}
      >
        <View className="flex-row items-center justify-between px-6 py-4"
          style={{ borderBottomWidth: 1, borderBottomColor: "rgba(255,215,0,0.1)" }}
        >
          <View className="flex-row items-center gap-2">
            <Settings size={15} color="#FFD700" strokeWidth={1.5} />
            <Text className="text-white text-sm font-semibold">Settings</Text>
          </View>
          <Pressable
            onPress={onClose}
            className="w-7 h-7 rounded-full items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
          >
            <X size={14} color="#C0C0D0" strokeWidth={1.5} />
          </Pressable>
        </View>

        <View className="flex-row gap-4 px-6 py-3" style={{ borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" }}>
          <StatusBadge icon={isConnected ? Wifi : WifiOff} label="Agent" connected={isConnected} />
          <StatusBadge icon={Server} label="LM Studio" connected={lmStatus === "connected"} />
          <View className="flex-row items-center gap-1">
            <Text className="text-ink-muted text-[10px]">{models.length} models</Text>
            <Pressable onPress={fetchModels} className="w-4 h-4 items-center justify-center">
              <RefreshCw size={9} color="#8888AA" strokeWidth={1.5} />
            </Pressable>
          </View>
        </View>

        <ScrollView className="px-6 py-4 pb-8" contentContainerStyle={{ gap: 16 }}>
          <View>
            <Field label="LM Studio URL" value={lmStudioUrl} onChange={setLmStudioUrl} />
            <View className="flex-row gap-1.5 mt-1.5">
              <Pressable
                onPress={() => setLmStudioUrl("http://localhost:1234")}
                className="px-2.5 py-1 rounded-lg"
                style={{
                  backgroundColor: lmStudioUrl.includes("1234") ? "rgba(0,229,255,0.12)" : "rgba(0,0,0,0.03)",
                  borderWidth: 1,
                  borderColor: lmStudioUrl.includes("1234") ? "rgba(0,229,255,0.25)" : "rgba(0,0,0,0.05)",
                }}
              >
                <Text style={{ fontSize: 9, color: lmStudioUrl.includes("1234") ? "#00E5FF" : "#4A4A6A", fontWeight: "600" }}>LM Studio :1234</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  apiClient.testLlmConnection(lmStudioUrl)
                    .then((result) => {
                      if (result.ok) {
                        alert(`LLM connected! ${result.models} models available.`);
                      } else {
                        alert(`LLM connection FAILED: ${result.error}`);
                      }
                    });
                }}
                className="px-2.5 py-1 rounded-lg"
                style={{ backgroundColor: "rgba(0,255,136,0.1)", borderWidth: 1, borderColor: "rgba(0,255,136,0.2)" }}
              >
                <Text style={{ fontSize: 9, color: "#00FF88", fontWeight: "600" }}>Test LM Studio</Text>
              </Pressable>
            </View>
          </View>
          <View>
            <Field label="Agent URL" value={agentUrl} onChange={setAgentUrl} />
            <Pressable
              onPress={() => {
                apiClient.testAgentConnection()
                  .then(() => {
                    alert("Agent connected!");
                  })
                  .catch((error: unknown) => {
                    alert(`Agent connection FAILED. ${error instanceof Error ? error.message : String(error)}`);
                  });
              }}
              className="mt-1.5 px-3 py-1.5 rounded-lg self-start"
              style={{ backgroundColor: "rgba(0,229,255,0.1)", borderWidth: 1, borderColor: "rgba(0,229,255,0.2)" }}
            >
              <Text style={{ fontSize: 10, color: "#00FF88", fontWeight: "600" }}>Test Connection</Text>
            </Pressable>
          </View>

          {/* Model Selectors */}
          <ModelSelector
            label="Generation Model (Code)"
            models={models}
            loading={modelsLoading}
            open={modelDropdownOpen}
            onToggle={() => { setModelDropdownOpen(!modelDropdownOpen); setPlannerDropdownOpen(false); setEnhancerDropdownOpen(false); }}
            onSelect={(id) => { setModel(id); setModelDropdownOpen(false); }}
            currentModel={model || models[0]?.id || "auto (first loaded)"}
          />
          <ModelSelector
            label="Planner Model (Architecture)"
            models={models}
            loading={modelsLoading}
            open={plannerDropdownOpen}
            onToggle={() => { setPlannerDropdownOpen(!plannerDropdownOpen); setModelDropdownOpen(false); setEnhancerDropdownOpen(false); }}
            onSelect={(id) => { setPlannerModel(id); setPlannerDropdownOpen(false); }}
            currentModel={plannerModel || "same as generation"}
          />

          <View className="flex-row gap-4">
            <View className="flex-1">
              <Field label="Temperature" value={String(temperature)} onChange={(v) => setTemperature(parseFloat(v) || 0.4)} keyboardType="numeric" />
            </View>
            <View className="flex-1">
              <Field label="Max Tokens" value={String(maxTokens)} onChange={(v) => setMaxTokens(parseInt(v, 10) || 65536)} keyboardType="numeric" />
            </View>
          </View>

          {/* Prompt Enhancer */}
          <View
            className="rounded-xl px-4 py-3"
            style={{ backgroundColor: "rgba(124, 77, 255, 0.06)", borderWidth: 1, borderColor: "rgba(124, 77, 255, 0.15)" }}
          >
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-white text-xs font-semibold">Prompt Enhancer</Text>
              <Pressable
                onPress={() => setEnhancerEnabled(!enhancerEnabled)}
                className="px-2 py-0.5 rounded"
                style={{
                  backgroundColor: enhancerEnabled ? "rgba(0,229,255,0.15)" : "rgba(0,0,0,0.04)",
                }}
              >
                <Text style={{ fontSize: 10, color: enhancerEnabled ? "#00E5FF" : "#8888AA" }}>
                  {enhancerEnabled ? "ON" : "OFF"}
                </Text>
              </Pressable>
            </View>
            <ModelSelector
              label="Enhancer Model"
              models={models}
              loading={modelsLoading}
              open={enhancerDropdownOpen}
              onToggle={() => { setEnhancerDropdownOpen(!enhancerDropdownOpen); setModelDropdownOpen(false); }}
              onSelect={(id) => { setEnhancerModel(id); setEnhancerDropdownOpen(false); }}
              currentModel={enhancerModel || "same as generation"}
            />
          </View>

          {/* Error Logs */}
          <ErrorLogPanel />
        </ScrollView>
      </View>
    </Modal>
  );
};

// ── Model Selector Dropdown ──
interface ModelSelectorProps {
  label: string;
  models: LmModel[];
  loading: boolean;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  currentModel: string;
}

const ModelSelector = ({ label, models, loading, open, onToggle, onSelect, currentModel }: ModelSelectorProps) => (
  <View>
    <Text className="text-ink-faint text-[10px] uppercase tracking-wider mb-1.5 font-medium">{label}</Text>
    <Pressable
      onPress={onToggle}
      className="flex-row items-center justify-between px-3 py-2.5 rounded-xl"
      style={{
        backgroundColor: "rgba(26,26,46,0.6)",
        borderWidth: 1,
        borderColor: open ? "rgba(255,215,0,0.4)" : "rgba(255,255,255,0.08)",
      }}
    >
      <Text style={{ fontSize: 12, color: "#C0C0D0", flex: 1 }} numberOfLines={1}>
        {loading ? "Loading models..." : currentModel}
      </Text>
      <ChevronDown size={12} color="#8888AA" strokeWidth={1.5} />
    </Pressable>
    {open && models.length > 0 && (
      <View
        className="mt-1 rounded-xl overflow-hidden"
        style={mixedStyle({
          backgroundColor: "rgba(18,18,31,0.95)",
          borderWidth: 1,
          borderColor: "rgba(255,215,0,0.15)",
          ...(Platform.OS === "web" ? { boxShadow: "0 4px 16px rgba(0,0,0,0.4)" } : {}),
          maxHeight: 150,
        })}
      >
        <ScrollView>
          {models.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => onSelect(m.id)}
              className="px-3 py-2.5"
              style={{
                borderBottomWidth: 1,
                borderBottomColor: "rgba(255,255,255,0.04)",
                backgroundColor: m.id === currentModel ? "rgba(255,215,0,0.1)" : "transparent",
              }}
            >
              <Text style={{ fontSize: 11, color: m.id === currentModel ? "#FFD700" : "#C0C0D0" }} numberOfLines={1}>
                {m.id}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    )}
    {open && models.length === 0 && !loading && (
      <View className="mt-1 px-3 py-2 rounded-xl" style={{ backgroundColor: "rgba(255,51,102,0.06)" }}>
        <Text style={{ fontSize: 10, color: "#FF3366" }}>No models loaded in LM Studio</Text>
      </View>
    )}
  </View>
);

// ── Status Badge ──
interface StatusBadgeProps {
  icon: typeof Wifi;
  label: string;
  connected: boolean;
}

const StatusBadge = ({ icon: Icon, label, connected }: StatusBadgeProps) => (
  <View className="flex-row items-center gap-1.5">
    <View className="w-2 h-2 rounded-full" style={{ backgroundColor: connected ? "#00FF88" : "#FF3366" }} />
    <Icon size={11} color={connected ? "#00E5FF" : "#FF3366"} strokeWidth={1.5} />
    <Text className="text-ink-muted text-[10px] font-medium">{label}</Text>
  </View>
);

// ── Text Field ──
interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: "default" | "numeric";
}

const Field = ({ label, value, onChange, keyboardType = "default" }: FieldProps) => (
  <View>
    <Text className="text-ink-faint text-[10px] uppercase tracking-wider mb-1.5 font-medium">{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChange}
      keyboardType={keyboardType}
      className="text-white text-sm px-3 py-2.5 rounded-xl"
      style={{
        backgroundColor: "rgba(26,26,46,0.6)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      }}
    />
  </View>
);

// ── Error Log Panel ──
type LogFilter = "all" | "error" | "warn" | "info";

const ErrorLogPanel = () => {
  const errorLogs = useSettingsStore((s) => s.errorLogs);
  const clearErrorLogs = useSettingsStore((s) => s.clearErrorLogs);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<LogFilter>("all");

  const errorCount = errorLogs.filter((l) => l.level === "error").length;
  const warnCount = errorLogs.filter((l) => l.level === "warn").length;
  const infoCount = errorLogs.filter((l) => l.level === "info").length;

  const filtered = filter === "all" ? errorLogs : errorLogs.filter((l) => l.level === filter);

  const copyLogs = useCallback((logs: typeof errorLogs) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    const text = logs
      .map((l) => {
        const time = new Date(l.timestamp).toLocaleTimeString();
        return `[${time}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}${l.details ? `\n  ${l.details}` : ""}`;
      })
      .join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  const copySingleLog = useCallback((log: typeof errorLogs[number]) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    const time = new Date(log.timestamp).toLocaleTimeString();
    const text = `[${time}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}${log.details ? `\n${log.details}` : ""}`;
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  const headerColor = errorCount > 0 ? "#FF3366" : errorLogs.length > 0 ? "#00E5FF" : "#8888AA";

  return (
    <View
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: errorCount > 0 ? "rgba(255, 51, 102, 0.04)" : "rgba(0, 229, 255, 0.02)",
        borderWidth: 1,
        borderColor: errorCount > 0 ? "rgba(255, 51, 102, 0.15)" : "rgba(0, 229, 255, 0.1)",
      }}
    >
      {/* Header */}
      <Pressable
        onPress={() => setExpanded(!expanded)}
        className="flex-row items-center justify-between px-4 py-3"
      >
        <View className="flex-row items-center gap-2">
          <AlertTriangle size={13} color={headerColor} strokeWidth={1.5} />
          <Text className="text-white text-xs font-semibold">Event Log</Text>
          <View className="flex-row items-center gap-1.5">
            {errorCount > 0 && (
              <View className="px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,51,102,0.15)" }}>
                <Text style={{ fontSize: 8, color: "#FF3366", fontWeight: "700" }}>{errorCount} err</Text>
              </View>
            )}
            {warnCount > 0 && (
              <View className="px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,215,0,0.12)" }}>
                <Text style={{ fontSize: 8, color: "#FFD700", fontWeight: "700" }}>{warnCount} warn</Text>
              </View>
            )}
            <View className="px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(0,229,255,0.08)" }}>
              <Text style={{ fontSize: 8, color: "#00E5FF", fontWeight: "600" }}>{errorLogs.length} total</Text>
            </View>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          {errorLogs.length > 0 && (
            <>
              <Pressable onPress={() => copyLogs(filtered)} className="p-1">
                <Copy size={12} color="#8888AA" strokeWidth={1.5} />
              </Pressable>
              <Pressable onPress={clearErrorLogs} className="p-1">
                <Trash2 size={12} color="#FF3366" strokeWidth={1.5} />
              </Pressable>
            </>
          )}
          <ChevronDown
            size={12}
            color="#8888AA"
            strokeWidth={1.5}
            style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}
          />
        </View>
      </Pressable>

      {expanded && (
        <View className="px-3 pb-3">
          {/* Filter tabs */}
          <View className="flex-row gap-1 mb-2">
            {(["all", "error", "warn", "info"] as const).map((level) => {
              const isActive = filter === level;
              const count = level === "all" ? errorLogs.length : level === "error" ? errorCount : level === "warn" ? warnCount : infoCount;
              const color = level === "error" ? "#FF3366" : level === "warn" ? "#FFD700" : level === "info" ? "#00E5FF" : "#4A4A6A";
              return (
                <Pressable
                  key={level}
                  onPress={() => setFilter(level)}
                  className="px-2 py-1 rounded-lg"
                  style={{
                    backgroundColor: isActive ? `${color}15` : "rgba(0,0,0,0.02)",
                    borderWidth: 1,
                    borderColor: isActive ? `${color}30` : "transparent",
                  }}
                >
                    <Text style={{ fontSize: 9, color: isActive ? color : "#4A4A6A", fontWeight: isActive ? "700" : "500" }}>
                    {level.toUpperCase()} ({count})
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Log entries */}
          {filtered.length === 0 ? (
            <View className="items-center py-4">
              <Info size={16} color="#8888AA" strokeWidth={1} />
              <Text style={{ fontSize: 10, color: "#8888AA", marginTop: 4 }}>
                {errorLogs.length === 0 ? "No events yet — logs appear during generation" : `No ${filter} events`}
              </Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 350 }}>
              {[...filtered].reverse().map((entry) => {
                const time = new Date(entry.timestamp).toLocaleTimeString();
                const levelColor = entry.level === "error" ? "#FF3366" : entry.level === "warn" ? "#FFD700" : "#00E5FF";
                return (
                  <Pressable
                    key={entry.id}
                    onPress={() => copySingleLog(entry)}
                    className="mb-1.5 p-2 rounded-lg"
                    style={{
                      backgroundColor: entry.level === "error" ? "rgba(255,51,102,0.04)" : "rgba(0,0,0,0.02)",
                    }}
                  >
                    <View className="flex-row items-center gap-1.5 mb-0.5">
                      <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: levelColor }} />
                      <Text style={{ fontSize: 8, color: "#8888AA", fontFamily: "monospace" }}>{time}</Text>
                      <Text style={{ fontSize: 8, color: levelColor, fontWeight: "700" }}>{entry.level.toUpperCase()}</Text>
                      <Text style={{ fontSize: 8, color: "#4A4A6A" }}>[{entry.source}]</Text>
                      <View className="flex-1" />
                      <Copy size={8} color="#C0C0D0" />
                    </View>
                    <Text style={{ fontSize: 11, color: "#C0C0D0", lineHeight: 15 }} numberOfLines={2}>
                      {entry.message}
                    </Text>
                    {entry.details && (
                      <Text
                        style={{ fontSize: 9, color: "#8888AA", fontFamily: "monospace", marginTop: 2, lineHeight: 13 }}
                        numberOfLines={5}
                      >
                        {entry.details}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
};

export default SettingsDrawer;
