// Golden few-shot exemplars (win-rate lever #4, path A).
//
// These are hand-vetted, 100%-correct, idiomatic files shown to the model as
// TEACHING MATERIAL ("do it like this"). One exemplar — at most — is injected into
// the per-file generation prompt so the model MIRRORS correct idioms (imports,
// @/ui usage, Tamagui inline props, async @/services/db persistence, empty/loading
// states) instead of improvising from abstract rules.
//
// CRITICAL: every exemplar below MUST obey ALL the rules in
// prompts/system-generator.ts and use ONLY the real @/ui exports
// (lib/scaffold-ui.ts) and the real @/services/db API (lib/scaffold-db.ts):
//   - UI + Icon from "@/ui" (Icon name is any string); NO View/Text/StyleSheet
//     from "react-native" (Pressable from "react-native" is OK).
//   - Tamagui inline props for styling; cards = <YStack ... borderWidth elevation>.
//   - `export default` for screens/components; named `export const useX` for stores.
//   - import every custom type you use: `import type { X } from "@/types/index"`.
//   - persist user data through "@/services/db" (createCollection / kv), loading in
//     useEffect / a store action and writing through on every mutation.
//   - the very last line of every file is `// EOF`.
// They live here as STRING constants (not compiled as project files), so the agent's
// tsc does not typecheck them — they must be correct BY INSPECTION. A quality-guard
// test (golden-examples.test.ts) defends them against regressions.
//
// Neutral domain ("items"/"notes") on purpose: the model copies PATTERNS, not the
// example's domain or names.

import { findBestExemplar } from "./exemplar-store.js";

/** A LIST screen: load a collection in useEffect, loading + empty states, card rows. */
export const LIST_SCREEN_EXAMPLE = `import { useEffect, useState } from "react";
import { FlatList, Pressable } from "react-native";
import { YStack, XStack, H2, Text, Paragraph, Button, Spinner, Icon } from "@/ui";
import { useRouter } from "expo-router";
import { createCollection } from "@/services/db";
import type { Item } from "@/types/index";

const items = createCollection<Item>("items");

export default function ItemsScreen() {
  const router = useRouter();
  const [data, setData] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    items
      .getAll()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  return (
    <YStack flex={1} bg="$background" p="$4" gap="$4">
      <YStack gap="$1">
        <H2>Items</H2>
        <Paragraph opacity={0.6}>Everything you have saved</Paragraph>
      </YStack>

      {loading ? (
        <YStack flex={1} ai="center" jc="center" p="$6">
          <Spinner size="large" color="$primary" />
        </YStack>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
          ListEmptyComponent={
            <YStack ai="center" jc="center" gap="$3" p="$6">
              <Icon name="inbox" size={48} color="#94A3B8" />
              <H2>No items yet</H2>
              <Paragraph opacity={0.6}>Add your first item to get started.</Paragraph>
              <Button bg="$primary" color="$background" br="$10" onPress={() => router.push("/new")}>
                Add item
              </Button>
            </YStack>
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push("/new")}>
              <XStack
                ai="center"
                gap="$3"
                p="$4"
                br="$6"
                borderWidth={1}
                borderColor="$borderColor"
                elevation={2}
                pressStyle={{ scale: 0.97, opacity: 0.9 }}
              >
                <Icon name="file-text" size={24} color="#6366F1" />
                <YStack flex={1} gap="$1">
                  <Text fontWeight="700">{item.title}</Text>
                  <Text opacity={0.6}>{item.subtitle}</Text>
                </YStack>
                <Icon name="chevron-right" size={20} color="#94A3B8" />
              </XStack>
            </Pressable>
          )}
        />
      )}
    </YStack>
  );
}
// EOF`;

/** A Zustand STORE: typed state+actions, persisted via @/services/db, narrow-selector friendly. */
export const STORE_EXAMPLE = `import { create } from "zustand";
import { createCollection } from "@/services/db";
import type { Item } from "@/types/index";

const items = createCollection<Item>("items");

interface ItemsState {
  items: Item[];
  loading: boolean;
  load: () => Promise<void>;
  addItem: (item: Item) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
}

export const useItemsStore = create<ItemsState>((set, get) => ({
  items: [],
  loading: false,
  load: async () => {
    set({ loading: true });
    const all = await items.getAll();
    set({ items: all, loading: false });
  },
  addItem: async (item) => {
    await items.save(item);
    set({ items: [...get().items, item] });
  },
  removeItem: async (id) => {
    await items.remove(id);
    set({ items: get().items.filter((item) => item.id !== id) });
  },
}));
// EOF`;

/** A reusable COMPONENT: typed Props interface above it, export default, Tamagui + pressStyle. */
export const COMPONENT_EXAMPLE = `import { Pressable } from "react-native";
import { XStack, YStack, Text, Icon } from "@/ui";

interface ItemRowProps {
  title: string;
  subtitle: string;
  icon?: string;
  onPress?: () => void;
}

export default function ItemRow({ title, subtitle, icon = "file-text", onPress }: ItemRowProps) {
  return (
    <Pressable onPress={onPress}>
      <XStack
        ai="center"
        gap="$3"
        p="$4"
        br="$6"
        borderWidth={1}
        borderColor="$borderColor"
        elevation={2}
        pressStyle={{ scale: 0.97, opacity: 0.9 }}
      >
        <Icon name={icon} size={24} color="#6366F1" />
        <YStack flex={1} gap="$1">
          <Text fontWeight="700">{title}</Text>
          <Text opacity={0.6}>{subtitle}</Text>
        </YStack>
        <Icon name="chevron-right" size={20} color="#94A3B8" />
      </XStack>
    </Pressable>
  );
}
// EOF`;

/** A FORM screen: controlled Input, inline validation error, primary submit calling a store action. */
export const FORM_SCREEN_EXAMPLE = `import { useState } from "react";
import { YStack, H2, Paragraph, Text, Input, Button } from "@/ui";
import { useRouter } from "expo-router";
import { useItemsStore } from "@/stores/itemsStore";
import type { Item } from "@/types/index";

export default function NewItemScreen() {
  const router = useRouter();
  const addItem = useItemsStore((state) => state.addItem);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (title.trim().length === 0) {
      setError("Title is required");
      return;
    }
    const item: Item = { id: Date.now().toString(), title: title.trim(), subtitle: "" };
    await addItem(item);
    setTitle("");
    router.back();
  };

  return (
    <YStack flex={1} bg="$background" p="$4" gap="$4">
      <YStack gap="$1">
        <H2>New item</H2>
        <Paragraph opacity={0.6}>Give your item a clear title.</Paragraph>
      </YStack>

      <YStack gap="$2">
        <Input
          value={title}
          onChangeText={(text) => {
            setTitle(text);
            if (error) setError("");
          }}
          placeholder="Title"
          borderWidth={1}
          borderColor="$borderColor"
        />
        {error ? <Text color="$red10">{error}</Text> : null}
      </YStack>

      <Button bg="$primary" color="$background" br="$10" size="$4" onPress={handleSubmit}>
        Save item
      </Button>
    </YStack>
  );
}
// EOF`;

interface GoldenExample {
  /** Stable id for tests/debugging. */
  id: string;
  /** The file `type` this exemplar teaches (screen / store / component). */
  type: string;
  /** When set, the file description must match one of these to pick this exemplar. */
  keywords?: RegExp;
  /** The complete, idiomatic exemplar code. */
  code: string;
}

// Ordered by selection priority within a type: more specific (keyword-gated)
// exemplars come first so they win over the generic fallback for that type.
const GOLDEN_EXAMPLES: GoldenExample[] = [
  {
    id: "form-screen",
    type: "screen",
    keywords: /\b(form|create|edit|new|add|input|compose|submit)\b/i,
    code: FORM_SCREEN_EXAMPLE,
  },
  {
    id: "list-screen",
    type: "screen",
    keywords: /\b(list|feed|items?|records?|notes?|tasks?|history|browse|collection|catalog|inbox|timeline)\b/i,
    code: LIST_SCREEN_EXAMPLE,
  },
  {
    id: "list-screen-default",
    type: "screen",
    code: LIST_SCREEN_EXAMPLE,
  },
  { id: "store", type: "store", code: STORE_EXAMPLE },
  { id: "component", type: "component", code: COMPONENT_EXAMPLE },
];

/**
 * Pick the single best golden exemplar for a file, or null when nothing clearly
 * matches. Research says TOP-1 only: this returns exactly one exemplar string (never
 * a list, never multiple). Selection keys off the file `type` (screen/store/
 * component) and is refined by description keywords for screens (form/create → form;
 * list/feed → list). Stores and components have one canonical exemplar each.
 *
 * Returns null for types with no exemplar (e.g. hook/type/layout) so the caller's
 * injection is additive: no match → the prompt is byte-identical to today.
 */
export const selectGoldenExample = (file: {
  type: string;
  description: string;
}): string | null => {
  const type = (file.type ?? "").toLowerCase().trim();
  const description = file.description ?? "";

  const candidates = GOLDEN_EXAMPLES.filter((example) => example.type === type);
  if (candidates.length === 0) return null;

  // Keyword-gated exemplars (in priority order) win over the generic fallback.
  for (const candidate of candidates) {
    if (candidate.keywords && candidate.keywords.test(description)) {
      return candidate.code;
    }
  }

  // Otherwise fall back to the first non-keyword (generic) exemplar for this type.
  const fallback = candidates.find((candidate) => !candidate.keywords);
  return fallback ? fallback.code : null;
};

/**
 * Pick the single best exemplar for a file, preferring a LEARNED one (path B —
 * captured from the user's own clean generations) over the curated GOLDEN one
 * (path A). A learned real example from the user's own domain teaches better than the
 * neutral golden one, but only clean-build / zero-repair files are ever learned (see
 * exemplar-store.ts + the capture gate in pipeline-codegen-phase.ts), so quality is
 * preserved.
 *
 * Strictly ADDITIVE: returns `findBestExemplar(file)` when a learned exemplar exists,
 * else `selectGoldenExample(file)`, else null. When there is neither learned nor
 * golden, the result is null and the prompt stays byte-identical to today.
 */
export const selectExemplar = (
  file: { type: string; description: string },
  opts: { dir?: string } = {}
): string | null => {
  const learned = findBestExemplar(file, opts);
  if (learned) return learned;
  return selectGoldenExample(file);
};

/**
 * Render the selected exemplar (learned-then-golden) into a clearly-labelled prompt
 * block, or "" when there is no match (so the caller adds no empty section and the
 * prompt stays byte-identical to today). Inject AT MOST ONE.
 */
export const buildGoldenExampleBlock = (
  file: { type: string; description: string },
  opts: { dir?: string } = {}
): string => {
  const example = selectExemplar(file, opts);
  if (!example) return "";
  return `## WORKING EXAMPLE — mirror these patterns (imports, Tamagui/@/ui usage, state, empty/loading states). Adapt to THIS file's purpose; do NOT copy the example's domain or names.\n\n${example}`;
};
// EOF
