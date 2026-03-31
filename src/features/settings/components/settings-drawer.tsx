import { View, Text, TextInput, Pressable, Modal, Platform } from "react-native";
import { X, Settings, Wifi, WifiOff, Server } from "lucide-react-native";
import { useSettingsStore } from "@/stores/settings-store";
import { useProjectStore } from "@/stores/project-store";

interface SettingsDrawerProps {
  visible: boolean;
  onClose: () => void;
}

const SettingsDrawer = ({ visible, onClose }: SettingsDrawerProps) => {
  const settings = useSettingsStore();
  const lmStatus = useProjectStore((s) => s.lmStudioStatus);
  const isConnected = useProjectStore((s) => s.isConnected);

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
        </View>

        <View className="px-6 py-4 gap-4 pb-8">
          <Field label="LM Studio URL" value={settings.lmStudioUrl} onChange={settings.setLmStudioUrl} />
          <Field label="Agent URL" value={settings.agentUrl} onChange={settings.setAgentUrl} />
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
            className="rounded-xl px-4 py-3 mt-2"
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
            <Field
              label="Enhancer Model (optional)"
              value={settings.enhancerModel}
              onChange={settings.setEnhancerModel}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

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
