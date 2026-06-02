// Draft + explicit Save so edits are not lost on backdrop close or store rehydrate.
import { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, TextInput, Pressable, Modal, Platform, ScrollView } from "react-native";
import { X, Settings, Wifi, WifiOff, Server, RefreshCw, ChevronDown, Trash2, Copy, AlertTriangle, Info, RotateCcw, Save } from "lucide-react-native";
import { apiClient, type LmModel } from "@/shared/lib/api-client";
import { mixedStyle } from "@/shared/lib/web-styles";
import {
  applySettingsDraft,
  snapshotSettingsDraft,
  type SettingsDraft,
  useSettingsStore,
} from "@/stores/settings-store";
import { defaultPersistedSettings } from "@/stores/settings-persist";
import { useProjectStore } from "@/stores/project-store";

interface SettingsDrawerProps {
  visible: boolean;
  onClose: () => void;
}

interface SamplingPreset {
  label: string;
  hint: string;
  temperature: number;
  topP: number;
}

// Quick sampling profiles. No hard ceiling — these are convenient starting points,
// the numeric fields below still accept any value the local model allows.
const SAMPLING_PRESETS: SamplingPreset[] = [
  { label: "Точный", hint: "0.1", temperature: 0.1, topP: 0.9 },
  { label: "Баланс", hint: "0.4", temperature: 0.4, topP: 1 },
  { label: "Креатив", hint: "0.8", temperature: 0.8, topP: 0.95 },
  { label: "Хаос", hint: "1.3", temperature: 1.3, topP: 1 },
];

const approxEqual = (a: number, b: number): boolean => Math.abs(a - b) < 0.0001;
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

// Keep the last valid value when the input is empty/non-numeric so typing does not
// snap to an arbitrary default; only reject negatives (invalid for both fields).
const parseNonNegative = (raw: string, fallback: number): number => {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
};

const parsePositiveInt = (raw: string, fallback: number): number => {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
};

const draftsEqual = (a: SettingsDraft, b: SettingsDraft): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const SettingsDrawer = ({ visible, onClose }: SettingsDrawerProps) => {
  const handleDiscardClose = useCallback(() => onClose(), [onClose]);

  const [draft, setDraft] = useState<SettingsDraft>(defaultPersistedSettings);
  const [savedSnapshot, setSavedSnapshot] = useState<SettingsDraft>(defaultPersistedSettings);

  const patchDraft = useCallback((patch: Partial<SettingsDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      if (patch.lmStudioUrl !== undefined && patch.lmStudioUrl !== prev.lmStudioUrl) {
        next.model = "";
      }
      return next;
    });
  }, []);

  const isDirty = useMemo(() => !draftsEqual(draft, savedSnapshot), [draft, savedSnapshot]);

  const handleSave = useCallback(() => {
    applySettingsDraft(draft);
    setSavedSnapshot(draft);
    onClose();
  }, [draft, onClose]);

  const lmStatus = useProjectStore((s) => s.lmStudioStatus);
  const isConnected = useProjectStore((s) => s.isConnected);

  const [models, setModels] = useState<LmModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [plannerDropdownOpen, setPlannerDropdownOpen] = useState(false);
  const [editorDropdownOpen, setEditorDropdownOpen] = useState(false);
  const [enhancerDropdownOpen, setEnhancerDropdownOpen] = useState(false);
  const [embeddingDropdownOpen, setEmbeddingDropdownOpen] = useState(false);

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

  const [debouncedUrl, setDebouncedUrl] = useState(draft.lmStudioUrl);

  useEffect(() => {
    if (!visible) return;
    const snap = snapshotSettingsDraft();
    setDraft(snap);
    setSavedSnapshot(snap);
    setDebouncedUrl(snap.lmStudioUrl);
  }, [visible]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedUrl(draft.lmStudioUrl), 500);
    return () => clearTimeout(timer);
  }, [draft.lmStudioUrl]);

  useEffect(() => {
    if (visible) void fetchModels().catch(() => {});
  }, [visible, debouncedUrl, fetchModels]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable className="flex-1" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onPress={handleDiscardClose} />
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
            {isDirty ? (
              <Text style={{ fontSize: 9, color: "#FF8844", marginLeft: 4 }}>не сохранено</Text>
            ) : null}
          </View>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={handleSave}
              disabled={!isDirty}
              accessibilityLabel="Save settings"
              className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{
                backgroundColor: isDirty ? "rgba(255,215,0,0.2)" : "rgba(255,255,255,0.04)",
                borderWidth: 1,
                borderColor: isDirty ? "rgba(255,215,0,0.45)" : "rgba(255,255,255,0.08)",
                opacity: isDirty ? 1 : 0.5,
              }}
            >
              <Save size={12} color={isDirty ? "#FFD700" : "#8888AA"} strokeWidth={2} />
              <Text style={{ fontSize: 11, fontWeight: "700", color: isDirty ? "#FFD700" : "#8888AA" }}>
                Сохранить
              </Text>
            </Pressable>
            <Pressable
              onPress={handleDiscardClose}
              accessibilityLabel="Close settings"
              className="w-7 h-7 rounded-full items-center justify-center"
              style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
            >
              <X size={14} color="#C0C0D0" strokeWidth={1.5} />
            </Pressable>
          </View>
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
            <Field label="LM Studio URL" value={draft.lmStudioUrl} onChange={(v) => patchDraft({ lmStudioUrl: v })} />
            <View className="flex-row gap-1.5 mt-1.5">
              <Pressable
                onPress={() => patchDraft({ lmStudioUrl: "http://localhost:1234" })}
                className="px-2.5 py-1 rounded-lg"
                style={{
                  backgroundColor: draft.lmStudioUrl.includes("1234") ? "rgba(0,229,255,0.12)" : "rgba(0,0,0,0.03)",
                  borderWidth: 1,
                  borderColor: draft.lmStudioUrl.includes("1234") ? "rgba(0,229,255,0.25)" : "rgba(0,0,0,0.05)",
                }}
              >
                <Text style={{ fontSize: 9, color: draft.lmStudioUrl.includes("1234") ? "#00E5FF" : "#4A4A6A", fontWeight: "600" }}>LM Studio :1234</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  apiClient.testLlmConnection(draft.lmStudioUrl)
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
            <Field label="Agent URL" value={draft.agentUrl} onChange={(v) => patchDraft({ agentUrl: v })} />
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
            hint="Used for all code generation. Leave on auto to use whichever model is first loaded in LM Studio."
            models={models}
            loading={modelsLoading}
            open={modelDropdownOpen}
            onToggle={() => { setModelDropdownOpen(!modelDropdownOpen); setPlannerDropdownOpen(false); setEditorDropdownOpen(false); setEnhancerDropdownOpen(false); setEmbeddingDropdownOpen(false); }}
            onSelect={(id) => { patchDraft({ model: id }); setModelDropdownOpen(false); }}
            savedModel={draft.model}
            autoLabel="auto (first loaded in LM Studio)"
          />
          <ModelSelector
            label="Planner Model (Architecture)"
            hint="Used only for the planning step. A smaller/faster model works well here."
            models={models}
            loading={modelsLoading}
            open={plannerDropdownOpen}
            onToggle={() => { setPlannerDropdownOpen(!plannerDropdownOpen); setModelDropdownOpen(false); setEditorDropdownOpen(false); setEnhancerDropdownOpen(false); setEmbeddingDropdownOpen(false); }}
            onSelect={(id) => { patchDraft({ plannerModel: id }); setPlannerDropdownOpen(false); }}
            savedModel={draft.plannerModel}
            autoLabel="same as generation"
          />
          <ModelSelector
            label="Editor / Fix Model"
            hint="Used when fixing build/type errors and applying chat edits (Fix Error). Pick a strong instruct/coder model so JSON analysis stays valid. Auto = same as generation."
            models={models}
            loading={modelsLoading}
            open={editorDropdownOpen}
            onToggle={() => { setEditorDropdownOpen(!editorDropdownOpen); setModelDropdownOpen(false); setPlannerDropdownOpen(false); setEnhancerDropdownOpen(false); setEmbeddingDropdownOpen(false); }}
            onSelect={(id) => { patchDraft({ editorModel: id }); setEditorDropdownOpen(false); }}
            savedModel={draft.editorModel}
            autoLabel="same as generation"
          />

          <View>
            <Text className="text-ink-faint text-[10px] uppercase tracking-wider mb-1.5 font-medium">
              Профиль сэмплинга
            </Text>
            <View className="flex-row gap-2">
              {SAMPLING_PRESETS.map((preset) => {
                const active = approxEqual(draft.temperature, preset.temperature) && approxEqual(draft.topP, preset.topP);
                return (
                  <Pressable
                    key={preset.label}
                    onPress={() => patchDraft({ temperature: preset.temperature, topP: preset.topP })}
                    className="flex-1 items-center px-2 py-2 rounded-xl"
                    style={{
                      backgroundColor: active ? "rgba(255,215,0,0.15)" : "rgba(26,26,46,0.6)",
                      borderWidth: 1,
                      borderColor: active ? "rgba(255,215,0,0.4)" : "rgba(255,255,255,0.08)",
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "700", color: active ? "#FFD700" : "#C0C0D0" }}>
                      {preset.label}
                    </Text>
                    <Text style={{ fontSize: 8, color: "#7C84A8", marginTop: 2 }}>{preset.hint}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View className="flex-row gap-4">
            <View className="flex-1">
              <Field
                label="Temperature"
                value={String(draft.temperature)}
                onChange={(v) => patchDraft({ temperature: parseNonNegative(v, draft.temperature) })}
                keyboardType="numeric"
              />
            </View>
            <View className="flex-1">
              <Field
                label="Top-P"
                value={String(draft.topP)}
                onChange={(v) => patchDraft({ topP: clamp01(parseNonNegative(v, draft.topP)) })}
                keyboardType="numeric"
              />
            </View>
            <View className="flex-1">
              <Field
                label="Max Tokens"
                value={String(draft.maxTokens)}
                onChange={(v) => patchDraft({ maxTokens: parsePositiveInt(v, draft.maxTokens) })}
                keyboardType="numeric"
              />
            </View>
          </View>
          <Text style={{ fontSize: 9, color: "#7C84A8", lineHeight: 14 }}>
            Лимиты сняты: можно ставить temperature {">"} 2 и любой Max Tokens — отвечает ваша LM Studio.
            Top-P 1 = без отсечения; ниже = только самые вероятные токены.
          </Text>

          {/* Prompt Enhancer */}
          <View
            className="rounded-xl px-4 py-3"
            style={{ backgroundColor: "rgba(124, 77, 255, 0.06)", borderWidth: 1, borderColor: "rgba(124, 77, 255, 0.15)" }}
          >
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-white text-xs font-semibold">Prompt Enhancer</Text>
              <Pressable
                onPress={() => patchDraft({ enhancerEnabled: !draft.enhancerEnabled })}
                className="px-2 py-0.5 rounded"
                style={{
                  backgroundColor: draft.enhancerEnabled ? "rgba(0,229,255,0.15)" : "rgba(0,0,0,0.04)",
                }}
              >
                <Text style={{ fontSize: 10, color: draft.enhancerEnabled ? "#00E5FF" : "#8888AA" }}>
                  {draft.enhancerEnabled ? "ON" : "OFF"}
                </Text>
              </Pressable>
            </View>
            <ModelSelector
              label="Enhancer Model"
              models={models}
              loading={modelsLoading}
              open={enhancerDropdownOpen}
              onToggle={() => { setEnhancerDropdownOpen(!enhancerDropdownOpen); setModelDropdownOpen(false); setPlannerDropdownOpen(false); setEditorDropdownOpen(false); setEmbeddingDropdownOpen(false); }}
              onSelect={(id) => { patchDraft({ enhancerModel: id }); setEnhancerDropdownOpen(false); }}
              savedModel={draft.enhancerModel}
              autoLabel="same as generation"
            />
          </View>

          {/* Smart context (semantic RAG) — on by default */}
          <View
            className="rounded-xl px-4 py-3"
            style={{ backgroundColor: "rgba(0, 229, 255, 0.06)", borderWidth: 1, borderColor: "rgba(0, 229, 255, 0.15)" }}
          >
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-white text-xs font-semibold">Умный контекст</Text>
              <Pressable
                onPress={() => patchDraft({ semanticRagEnabled: !draft.semanticRagEnabled })}
                className="px-2 py-0.5 rounded"
                style={{
                  backgroundColor: draft.semanticRagEnabled ? "rgba(0,229,255,0.15)" : "rgba(0,0,0,0.04)",
                }}
              >
                <Text style={{ fontSize: 10, color: draft.semanticRagEnabled ? "#00E5FF" : "#8888AA" }}>
                  {draft.semanticRagEnabled ? "ВКЛ" : "ВЫКЛ"}
                </Text>
              </Pressable>
            </View>
            <Text style={{ fontSize: 10, color: "#8888AA", lineHeight: 15, marginBottom: 8 }}>
              Перед каждым файлом агент подбирает только нужные правила (Tamagui, формы, БД, прошлые
              фиксы) — не весь справочник. Нужна embedding-модель в LM Studio; если не указать —
              подберётся автоматически (nomic-embed, bge…).
            </Text>
            <ModelSelector
              label="Модель эмбеддингов (необязательно)"
              hint="Переопределение вручную. Пусто = авто из списка моделей LM Studio."
              models={models}
              loading={modelsLoading}
              open={embeddingDropdownOpen}
              onToggle={() => { setEmbeddingDropdownOpen(!embeddingDropdownOpen); setModelDropdownOpen(false); setPlannerDropdownOpen(false); setEditorDropdownOpen(false); setEnhancerDropdownOpen(false); }}
              onSelect={(id) => { patchDraft({ embeddingModel: id }); setEmbeddingDropdownOpen(false); }}
              savedModel={draft.embeddingModel}
              autoLabel="авто (из LM Studio)"
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
  hint?: string;
  models: LmModel[];
  loading: boolean;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  /** The currently saved model ID (empty string = auto). */
  savedModel: string;
  /** Placeholder shown when savedModel is empty. */
  autoLabel: string;
}

const ModelSelector = ({
  label,
  hint,
  models,
  loading,
  open,
  onToggle,
  onSelect,
  savedModel,
  autoLabel,
}: ModelSelectorProps) => {
  const [manualInput, setManualInput] = useState(savedModel);

  const displayLabel = loading
    ? "Loading models…"
    : savedModel || autoLabel;

  const handleManualCommit = () => {
    const trimmed = manualInput.trim();
    onSelect(trimmed);
  };

  return (
    <View>
      <View className="flex-row items-center justify-between mb-1.5">
        <Text className="text-ink-faint text-[10px] uppercase tracking-wider font-medium">{label}</Text>
        {savedModel ? (
          <Pressable
            onPress={() => { onSelect(""); setManualInput(""); }}
            className="flex-row items-center gap-1 px-1.5 py-0.5 rounded"
            style={{ backgroundColor: "rgba(255,51,102,0.1)" }}
          >
            <RotateCcw size={8} color="#FF3366" strokeWidth={2} />
            <Text style={{ fontSize: 8, color: "#FF3366", fontWeight: "600" }}>reset to auto</Text>
          </Pressable>
        ) : (
          <Text style={{ fontSize: 9, color: "#4A4A6A" }}>{autoLabel}</Text>
        )}
      </View>

      {/* Dropdown trigger */}
      <Pressable
        onPress={onToggle}
        className="flex-row items-center justify-between px-3 py-2.5 rounded-xl"
        style={{
          backgroundColor: "rgba(26,26,46,0.6)",
          borderWidth: 1,
          borderColor: open ? "rgba(255,215,0,0.4)" : savedModel ? "rgba(0,229,255,0.25)" : "rgba(255,255,255,0.08)",
        }}
      >
        <Text style={{ fontSize: 12, color: savedModel ? "#00E5FF" : "#6A6A8A", flex: 1 }} numberOfLines={1}>
          {displayLabel}
        </Text>
        <ChevronDown size={12} color="#8888AA" strokeWidth={1.5} />
      </Pressable>

      {/* Expanded panel */}
      {open && (
        <View
          className="mt-1 rounded-xl overflow-hidden"
          style={mixedStyle({
            backgroundColor: "rgba(18,18,31,0.97)",
            borderWidth: 1,
            borderColor: "rgba(255,215,0,0.15)",
            ...(Platform.OS === "web" ? { boxShadow: "0 4px 16px rgba(0,0,0,0.5)" } : {}),
          })}
        >
          {/* Manual entry */}
          <View
            className="px-3 py-2.5"
            style={{ borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" }}
          >
            <Text style={{ fontSize: 9, color: "#8888AA", marginBottom: 6, fontWeight: "600" }}>
              ENTER MODEL ID MANUALLY
            </Text>
            <View className="flex-row items-center gap-2">
              <TextInput
                value={manualInput}
                onChangeText={setManualInput}
                placeholder="e.g. qwen2.5-coder-7b-instruct"
                placeholderTextColor="#4A4A6A"
                style={{
                  flex: 1,
                  fontSize: 11,
                  color: "#C0C0D0",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
                onSubmitEditing={handleManualCommit}
              />
              <Pressable
                onPress={handleManualCommit}
                className="px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: "rgba(0,229,255,0.12)", borderWidth: 1, borderColor: "rgba(0,229,255,0.25)" }}
              >
                <Text style={{ fontSize: 10, color: "#00E5FF", fontWeight: "700" }}>Set</Text>
              </Pressable>
            </View>
          </View>

          {/* Fetched models list */}
          {models.length > 0 ? (
            <ScrollView style={{ maxHeight: 140 }}>
              {models.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => { onSelect(m.id); setManualInput(m.id); }}
                  className="px-3 py-2.5"
                  style={{
                    borderBottomWidth: 1,
                    borderBottomColor: "rgba(255,255,255,0.04)",
                    backgroundColor: m.id === savedModel ? "rgba(255,215,0,0.1)" : "transparent",
                  }}
                >
                  <Text
                    style={{ fontSize: 11, color: m.id === savedModel ? "#FFD700" : "#C0C0D0" }}
                    numberOfLines={1}
                  >
                    {m.id}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : loading ? (
            <View className="px-3 py-3">
              <Text style={{ fontSize: 10, color: "#8888AA" }}>Loading models from LM Studio…</Text>
            </View>
          ) : (
            <View className="px-3 py-3">
              <Text style={{ fontSize: 10, color: "#FF8844" }}>
                No models found via API — enter the model ID manually above, or load a model in LM Studio first.
              </Text>
            </View>
          )}
        </View>
      )}

      {hint && (
        <Text style={{ fontSize: 9, color: "#4A4A6A", marginTop: 4, lineHeight: 13 }}>{hint}</Text>
      )}
    </View>
  );
};

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
