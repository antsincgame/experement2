import { useState, useEffect, useCallback } from "react";
import { View, Text, TextInput, Pressable, Modal, Platform, ScrollView } from "react-native";
import { X, Settings, Wifi, WifiOff, Server, RefreshCw, ChevronDown } from "lucide-react-native";
import { useSettingsStore } from "@/stores/settings-store";
import { useProjectStore } from "@/stores/project-store";

interface SettingsDrawerProps {
  visible: boolean;
  onClose: () => void;
}

interface LmModel {
  id: string;
  object: string;
}

const SettingsDrawer = ({ visible, onClose }: SettingsDrawerProps) => {
  const settings = useSettingsStore();
  const lmStatus = useProjectStore((s) => s.lmStudioStatus);
  const isConnected = useProjectStore((s) => s.isConnected);

  const [models, setModels] = useState<LmModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [enhancerDropdownOpen, setEnhancerDropdownOpen] = useState(false);

  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const resp = await fetch(`${settings.lmStudioUrl}/v1/models`);
      if (resp.ok) {
        const data = await resp.json();
        setModels(data.data ?? []);
      }
    } catch { /* LM Studio offline */ }
    finally { setModelsLoading(false); }
  }, [settings.lmStudioUrl]);

  useEffect(() => {
    if (visible) fetchModels();
  }, [visible, fetchModels]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable className="flex-1" style={{ backgroundColor: "rgba(0,0,0,0.3)" }} onPress={onClose} />
      <View
        className="absolute bottom-0 left-0 right-0 rounded-t-3xl"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.85)",
          ...(Platform.OS === "web"
            ? { backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }
            : {}),
          borderTopWidth: 1,
          borderTopColor: "rgba(255,255,255,0.9)",
          maxHeight: "80%",
        } as never}
      >
        <View className="flex-row items-center justify-between px-6 py-4"
          style={{ borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" }}
        >
          <View className="flex-row items-center gap-2">
            <Settings size={15} color="#7C4DFF" strokeWidth={1.5} />
            <Text className="text-ink-dark text-sm font-semibold">Settings</Text>
          </View>
          <Pressable
            onPress={onClose}
            className="w-7 h-7 rounded-full items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.05)" }}
          >
            <X size={14} color="#4A4A6A" strokeWidth={1.5} />
          </Pressable>
        </View>

        <View className="flex-row gap-4 px-6 py-3" style={{ borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.04)" }}>
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
          <Field label="LM Studio URL" value={settings.lmStudioUrl} onChange={settings.setLmStudioUrl} />
          <Field label="Agent URL" value={settings.agentUrl} onChange={settings.setAgentUrl} />

          {/* Model Selector */}
          <ModelSelector
            label="Generation Model"
            models={models}
            loading={modelsLoading}
            open={modelDropdownOpen}
            onToggle={() => { setModelDropdownOpen(!modelDropdownOpen); setEnhancerDropdownOpen(false); }}
            onSelect={(id) => { /* stored on agent side, just show info */ setModelDropdownOpen(false); }}
            currentModel={models[0]?.id ?? "auto (first loaded)"}
          />

          <View className="flex-row gap-4">
            <View className="flex-1">
              <Field label="Temperature" value={String(settings.temperature)} onChange={(v) => settings.setTemperature(parseFloat(v) || 0.4)} keyboardType="numeric" />
            </View>
            <View className="flex-1">
              <Field label="Max Tokens" value={String(settings.maxTokens)} onChange={(v) => settings.setMaxTokens(parseInt(v, 10) || 32768)} keyboardType="numeric" />
            </View>
          </View>

          {/* Prompt Enhancer */}
          <View
            className="rounded-xl px-4 py-3"
            style={{ backgroundColor: "rgba(124, 77, 255, 0.06)", borderWidth: 1, borderColor: "rgba(124, 77, 255, 0.15)" }}
          >
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-ink-base text-xs font-semibold">Prompt Enhancer</Text>
              <Pressable
                onPress={() => settings.setEnhancerEnabled(!settings.enhancerEnabled)}
                className="px-2 py-0.5 rounded"
                style={{
                  backgroundColor: settings.enhancerEnabled ? "rgba(0,229,255,0.15)" : "rgba(0,0,0,0.04)",
                }}
              >
                <Text style={{ fontSize: 10, color: settings.enhancerEnabled ? "#00E5FF" : "#8888AA" }}>
                  {settings.enhancerEnabled ? "ON" : "OFF"}
                </Text>
              </Pressable>
            </View>
            <ModelSelector
              label="Enhancer Model"
              models={models}
              loading={modelsLoading}
              open={enhancerDropdownOpen}
              onToggle={() => { setEnhancerDropdownOpen(!enhancerDropdownOpen); setModelDropdownOpen(false); }}
              onSelect={(id) => { settings.setEnhancerModel(id); setEnhancerDropdownOpen(false); }}
              currentModel={settings.enhancerModel || "same as generation"}
            />
          </View>
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
    <Text className="text-ink-light text-[10px] uppercase tracking-wider mb-1.5 font-medium">{label}</Text>
    <Pressable
      onPress={onToggle}
      className="flex-row items-center justify-between px-3 py-2.5 rounded-xl"
      style={{
        backgroundColor: "rgba(255,255,255,0.7)",
        borderWidth: 1,
        borderColor: open ? "rgba(0,229,255,0.4)" : "rgba(0,0,0,0.06)",
      }}
    >
      <Text style={{ fontSize: 12, color: "#4A4A6A", flex: 1 }} numberOfLines={1}>
        {loading ? "Loading models..." : currentModel}
      </Text>
      <ChevronDown size={12} color="#8888AA" strokeWidth={1.5} />
    </Pressable>
    {open && models.length > 0 && (
      <View
        className="mt-1 rounded-xl overflow-hidden"
        style={{
          backgroundColor: "rgba(255,255,255,0.95)",
          borderWidth: 1,
          borderColor: "rgba(0,0,0,0.08)",
          ...(Platform.OS === "web" ? { boxShadow: "0 4px 16px rgba(0,0,0,0.1)" } : {}),
          maxHeight: 150,
        } as never}
      >
        <ScrollView>
          {models.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => onSelect(m.id)}
              className="px-3 py-2.5"
              style={{
                borderBottomWidth: 1,
                borderBottomColor: "rgba(0,0,0,0.04)",
                backgroundColor: m.id === currentModel ? "rgba(0,229,255,0.08)" : "transparent",
              }}
            >
              <Text style={{ fontSize: 11, color: m.id === currentModel ? "#00BCD4" : "#4A4A6A" }} numberOfLines={1}>
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
    <Text className="text-ink-light text-[10px] uppercase tracking-wider mb-1.5 font-medium">{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChange}
      keyboardType={keyboardType}
      className="text-ink-dark text-sm px-3 py-2.5 rounded-xl"
      style={{
        backgroundColor: "rgba(255,255,255,0.7)",
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.06)",
      }}
    />
  </View>
);

export default SettingsDrawer;
