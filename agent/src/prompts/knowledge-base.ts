// Surgical RAG knowledge base — token-optimized API snippets injected per-file by keyword matching.

export const KNOWLEDGE_BASE = {
  tamaguiCore: `## 📚 RAG DOCS: TAMAGUI 1.x CORE (CRITICAL)
1. LAYOUT: ALWAYS use <YStack> (col), <XStack> (row). NEVER use React Native View. Import ALL primitives (YStack, XStack, Text, Paragraph, H1-H4, Button, Input, TextArea, ScrollView, Card, Switch, Slider, Spinner, Sheet, Dialog, Icon) from "@/ui" — NEVER from "tamagui" directly. Use \`separator={<Separator />}\` for lists.
2. TEXT: Use <Text>, <Paragraph>, <H1>-<H6>. NEVER use React Native Text.
3. TOKENS: p="$4", m="$2", gap="$3", br="$4", w="100%", h="$4", flex={1}.
4. COLORS: Prefer Tamagui tokens like bg="$background", color="$color", borderColor="$borderColor" for Tamagui components. Hex/RGBA values are acceptable for planner theme values and third-party library configs.
5. BORDERS: borderWidth={1} (or bw={1}). NEVER use boolean 'bordered'.
6. THEMING: Use <ThemeInverse> to automatically invert colors for a section.
7. COMPONENTS: <Button backgroundColor="$primary" size="$4">Text</Button>. NEVER use the 'theme' prop on ANY component (it causes TS2322 errors). Use direct color props instead.
8. ICONS: import { Icon } from "@/ui"; then <Icon name="..." size={24} color="#333" />.
   The "name" prop is a plain string, so any descriptive name works (e.g. "calculator", "heart", "trash-2", "bar-chart-2"). Unknown names safely degrade to a neutral glyph — they NEVER cause a type or runtime error. NEVER import from "@expo/vector-icons" directly.
   Example: <Icon name="bar-chart-2" size={24} color="#333" />
9. NEVER invent props like 'onSwipeEnd', 'onSwipeLeft', 'onDismiss'. Use standard 'onPress' or 'onLongPress' from Pressable (react-native).
10. PRESSABLE: NEVER import Pressable from "tamagui". Import from "react-native" or use <Button>.
11. TYPES: If you use a custom type (like Todo), you MUST import it: import type { Todo } from "@/types/index".
12. THEME NAME: <Theme name="light"> or <Theme name="dark"> ONLY. For conditional styling use inline props: bg={isActive ? "$blue5" : "$gray3"}.`,

  designSystem: `## 📚 RAG DOCS: PREMIUM DESIGN SYSTEM & PATTERNS
1. SPACING SCALE: one rhythm everywhere — p="$4" screens, gap="$3" between list items, "$2" inside cards, "$5"+ between sections. Consistent spacing is the biggest driver of a "designed" look.
2. TYPE SCALE: <H1> hero, <H2> screen title, bold <Text> for card titles, <Paragraph> body, small + opacity={0.6} for meta. Pair a bold title with a muted subtitle.
3. CARD (the default building block): <YStack p="$4" br="$6" borderWidth={1} borderColor="$borderColor" elevation={2} gap="$2">. Group content into cards instead of loose stacked elements.
4. STAT CARD: a Row of 2-3 cards, each = small muted label + big bold number (<H2>) + tiny trend caption. Ideal for dashboards/home.
5. LIST ROW: <XStack ai="center" gap="$3" p="$3"> leading Icon/avatar, <YStack f={1}> title + muted subtitle </YStack>, trailing chevron or value. Wrap in Pressable with pressStyle.
6. SECTION HEADER: small uppercase muted label, optional trailing "See all" text button, above a group of cards.
7. EMPTY STATE: centered <YStack ai="center" gap="$3" p="$6"> big Icon + <H3> title + muted one-line subtitle + a primary Button CTA. Never show a blank list.
8. SKELETON LOADING: while loading render 3-5 placeholder rows (YStack bg="$borderColor" opacity={0.4} br="$4" with a fixed height) instead of a blank screen or bare spinner.
9. FAB: floating circular primary action — <Button position="absolute" b="$5" r="$5" w={56} h={56} br={28} bg="$primary" elevation={4}>.
10. PRIMARY CTA: exactly one filled bg="$primary" button per view; secondary actions are outline/ghost. Full-width primary at the bottom of forms.
11. MICRO-INTERACTION: pressStyle={{ scale: 0.97 }} on every tappable; animation="bouncy" + enterStyle on cards/lists/sheets; expo-haptics on key actions.
12. AVOID (reads as primitive): single font size, gray-on-white flat blocks with no cards, no empty/loading states, default unstyled buttons, no press feedback, cramped or zero spacing, everything left-aligned.`,

  forms: `## 📚 RAG DOCS: TAMAGUI FORMS & INPUTS
1. INPUTS: <Input placeholder="Type..." bw={1} bc="$borderColor" /> or <TextArea />.
2. SWITCH: MUST use 'checked' and 'onCheckedChange' (NOT value/onChange).
   <Switch size="$4" checked={val} onCheckedChange={setVal}><Switch.Thumb animation="bouncy" /></Switch>
3. SLIDER: from "@/ui" — pass simple props, NEVER children. value is a number[].
   <Slider value={[amount]} min={0} max={5000} step={10} onValueChange={(v) => setAmount(v[0])} />
4. RADIO/CHECKBOX: Use native Tamagui <RadioGroup> or <Checkbox>.
5. DATE: NEVER use DatePickerIOS/Android. Use a formatted <Input placeholder="YYYY-MM-DD" />.`,

  overlays: `## 📚 RAG DOCS: TAMAGUI OVERLAYS (Sheet, Dialog, Toast)
1. SHEET (Bottom Sheet): Import Sheet from "@/ui". Use COMPOUND syntax (Sheet.Overlay, Sheet.Handle, Sheet.Frame). NEVER import SheetHandle/SheetFrame/SheetOverlay separately. Do NOT use animation prop on Sheet (it does not exist). Do NOT use animation on Sheet.Overlay.
   <Sheet modal open={open} onOpenChange={setOpen} snapPoints={[50]} position={0} dismissOnSnapToBottom>
     <Sheet.Overlay />
     <Sheet.Handle />
     <Sheet.Frame p="$4"><Text>Content</Text></Sheet.Frame>
   </Sheet>
2. DIALOG (Modal): Import Dialog from "@/ui". Use COMPOUND syntax (Dialog.Portal, Dialog.Overlay, Dialog.Content).
   <Dialog modal open={open} onOpenChange={setOpen}>
     <Dialog.Portal>
       <Dialog.Overlay key="overlay" opacity={0.5} />
       <Dialog.Content key="content" p="$4" br="$4" bg="$background">
         <Text>Content</Text>
       </Dialog.Content>
     </Dialog.Portal>
   </Dialog>`,

  animations: `## 📚 RAG DOCS: TAMAGUI ANIMATIONS & INTERACTIONS
1. PRESETS: Add \`animation="bouncy"\`, \`"lazy"\`, or \`"quick"\` to any component.
2. MOUNT/UNMOUNT: Use \`enterStyle={{ opacity: 0, y: 10, scale: 0.9 }}\` and \`exitStyle={{ opacity: 0, y: -10 }}\` for fluid entry/exit.
3. TACTILE PROPS: Use \`pressStyle={{ scale: 0.97, opacity: 0.8 }}\` and \`hoverStyle={{ opacity: 0.9 }}\` on buttons/cards.
4. HAPTICS: Import \`* as Haptics from 'expo-haptics'\` and call \`Haptics.selectionAsync()\` on press events.`,

  alpineWeb: `## 📚 RAG DOCS: ALPINE.JS WEB ANIMATIONS & MICRO-INTERACTIONS
1. USE ALPINE ONLY FOR WEB-ONLY TEMPLATES OR STATIC HTML FRAGMENTS. NEVER put Alpine.js into Expo React Native runtime files.
2. STATE: Prefer \`x-data\` with small local state objects: \`x-data="{ open: false, active: 'all' }"\`.
3. TOGGLES: Use \`x-show\`, \`x-cloak\`, \`@click\`, \`@keydown.escape.window\`, \`@click.outside\` for dropdowns, modals, accordions.
4. ANIMATIONS: Prefer \`x-transition\` with clear enter/leave durations: \`x-transition.opacity.duration.200ms\`, \`x-transition:enter="transition ease-out duration-200"\`.
5. LIST FILTERS/TABS: Use \`x-for\` + computed getters or small helper methods inside \`x-data\`. Keep logic readable; no giant inline expressions.
6. ACCESSIBILITY: Mirror state with \`:aria-expanded\`, \`:aria-hidden\`, focusable buttons, and keyboard close handlers.
7. NEVER mix Alpine DOM mutation with large imperative scripts when declarative directives are enough.
8. GOOD FIT: dropdowns, tabs, accordion, modal, command palette, hover/focus micro-interactions, dismissible banners.`,

  tailwindTemplates: `## 📚 RAG DOCS: TAILWINDCSS UI STARTERS & STYLING PATTERNS
1. USE TAILWIND TEMPLATES ONLY FOR WEB-ONLY HTML/JSX SURFACES OR WHEN THE USER EXPLICITLY ASKS FOR TAILWIND-LIKE STRUCTURE. For Expo React Native screens, translate the intent into NativeWind/Tamagui patterns instead of raw CSS classes.
2. START FROM COMPOSABLE BLOCKS: page shell, hero, stats grid, card list, pricing cards, auth form, settings panel, modal, command menu.
3. SPACING SYSTEM: Prefer \`px-4 sm:px-6 lg:px-8\`, \`py-12 sm:py-16\`, \`gap-4 sm:gap-6\`, \`max-w-7xl mx-auto\` for balanced layouts.
4. CARD TEMPLATE: \`rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm backdrop-blur\`.
5. DARK PANELS: \`bg-slate-950 text-white\`, muted copy via \`text-slate-400\`, dividers via \`border-white/10\`.
6. CTA BUTTONS: primary \`inline-flex items-center justify-center rounded-xl px-4 py-2.5 font-medium\`; add hover/focus/active states explicitly.
7. MOTION: Pair Tailwind transitions with utility presets like \`transition duration-200 ease-out\`; if richer interaction is needed on web-only surfaces, combine with Alpine \`x-transition\`.
8. SKELETONS/EMPTY STATES: use subtle borders, muted text, and one strong CTA rather than noisy gradients everywhere.
9. DO NOT dump giant template blobs. Adapt a template block to the requested feature and keep the class list intentional.`,

  persistence: `## 📚 RAG DOCS: LOCAL-FIRST DATA LAYER ("@/services/db")
Persist user data so it survives reloads. Cross-platform (web preview + native), zero backend.
import { createCollection, kv } from "@/services/db";
1. COLLECTION (records with a string id):
   const todos = createCollection<Todo>("todos");
   await todos.save(todo);            // insert or update by id
   const all = await todos.getAll();  // Promise<Todo[]>
   await todos.remove(id); await todos.clear();
2. KV (single object / settings):
   await kv.set("settings", settings); const s = await kv.get<Settings>("settings");
3. ASYNC: every method returns a Promise — await inside useEffect/handlers, then push into Zustand/useState.
4. PATTERN: on mount load getAll() into state; on each mutation call save/remove AND update state.
NEVER hand-write SQL or call a remote API for local data — use this layer.`,

  sqlite: `## 📚 RAG DOCS: DATABASE / SQL / OFFLINE STORAGE
This project does NOT use expo-sqlite (it is not installed and is not web-compatible).
For ALL local/offline/database storage use the blessed "@/services/db" layer instead:
import { createCollection, kv } from "@/services/db";
- A "database table" of records → \`const items = createCollection<Item>("items")\`; save/getAll/remove/clear.
- A single settings/object row → \`kv.set(key, value)\` / \`kv.get<T>(key)\`.
NEVER import expo-sqlite, write raw SQL, .transaction(), .executeSql(), or open a database file.`,

  charts: `## 📚 RAG DOCS: REACT-NATIVE-CHART-KIT
The 'data' prop MUST exactly match this TS interface to prevent TS2322:
{ labels: string[], datasets: { data: number[], color?: (opacity: number) => string, strokeWidth?: number }[] }
Hex/RGBA values are allowed inside chartConfig because this is third-party library config, not Tamagui styling.
Example: <LineChart data={{ labels: ["A"], datasets: [{ data: [1] }] }} width={300} height={200} chartConfig={{ backgroundColor: "#fff", color: (o = 1) => \`rgba(0,0,0,\${o})\` }} />`,
  navigation: `## 📚 RAG DOCS: EXPO-ROUTER NAVIGATION (FILE-BASED)
1. ROUTES = FILES under app/. app/index.tsx = "/", app/profile.tsx = "/profile". A root app/index.tsx ("/") MUST exist or Expo web 404s a blank preview.
2. LAYOUTS: app/_layout.tsx renders <Stack>; tab apps add app/(tabs)/_layout.tsx with <Tabs>. Route groups like (tabs) are invisible in the URL.
3. STACK: import { Stack } from "expo-router"; <Stack screenOptions={{ headerShown: false }} />. Per-screen: <Stack.Screen name="profile" options={{ title: "Profile" }} />.
4. TABS: import { Tabs } from "expo-router"; <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <Icon name="home" color={color} /> }} />. The name = the file segment, not a path.
5. LINK (declarative): import { Link } from "expo-router"; <Link href="/profile">Profile</Link>, or <Link href="/profile" asChild><Button>Go</Button></Link>. typedRoutes is ON, so href must be a real route.
6. ROUTER (imperative): import { useRouter } from "expo-router"; const router = useRouter(); router.push("/profile"); router.back(); router.replace("/").
7. DYNAMIC ROUTE: file app/item/[id].tsx. Navigate type-safely with href={{ pathname: "/item/[id]", params: { id } }}. Read params via const { id } = useLocalSearchParams<{ id: string }>().
8. NEVER import @react-navigation or use NavigationContainer/createStackNavigator — expo-router owns routing.`,

  lists: `## 📚 RAG DOCS: LISTS & ASYNC DATA STATES
1. LONG/DYNAMIC LISTS: use FlatList from "react-native" (Tamagui has no list). Do NOT .map() large arrays into a ScrollView.
   <FlatList data={items} keyExtractor={(it) => it.id} renderItem={({ item }) => <Row item={item} />} contentContainerStyle={{ padding: 16, gap: 12 }} />
2. keyExtractor MUST return a stable string id — never the array index for a list that can reorder or delete.
3. LOAD: const [items, setItems] = useState<Todo[]>([]); const [loading, setLoading] = useState(true); useEffect(() => { todos.getAll().then(setItems).finally(() => setLoading(false)); }, []).
4. EMPTY STATE: pass ListEmptyComponent={<YStack ai="center" p="$6"><Text color="$color10">Nothing yet</Text></YStack>}; render it only when !loading.
5. LOADING: show <Spinner /> (tamagui) or <ActivityIndicator /> (react-native) while loading — not together with the empty state.
6. MUTATE: after save/remove, update BOTH the data layer AND state (setItems(...)) so the list updates without a reload.
7. SECTIONS: SectionList with sections={[{ title, data }]} + renderSectionHeader; separators via ItemSeparatorComponent.`,

  stateZustand: `## 📚 RAG DOCS: ZUSTAND STATE MANAGEMENT
NOTE: add "zustand" to the plan dependencies (known-safe extra). For small screen-local state, plain useState is enough — use Zustand for state shared across screens.
1. STORE: import { create } from "zustand"; interface CartState { items: Item[]; add: (i: Item) => void } export const useCart = create<CartState>((set) => ({ items: [], add: (i) => set((s) => ({ items: [...s.items, i] })) })).
2. SELECT NARROW: const items = useCart((s) => s.items) — subscribe to ONE field per call. Avoid const { items } = useCart(), which re-renders on every state change.
3. ACTIONS IN STORE: define setters inside create(); only ever update via set() (a shallow merge). Never mutate state objects directly.
4. ASYNC + PERSIST: inside an action, await @/services/db (kv.get / collection.getAll), then set(...). On every mutation, write through to the data layer AND set(...).
5. NO PROVIDER: a store is just a hook — import and call it anywhere. Do NOT wrap the app in a context provider for it.
6. DERIVED DATA: compute in the selector (useCart((s) => s.items.length)) or during render — do not duplicate it as extra state.`,

  gesturesMotion: `## 📚 RAG DOCS: GESTURES, MOTION, SAFE AREA & IMAGES
1. SAFE AREA: import { SafeAreaView } from "react-native-safe-area-context" (NOT react-native). Wrap screen roots, or use useSafeAreaInsets() for manual padding. The provider is already mounted in the root layout.
2. KEYBOARD: wrap forms in <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}> (react-native); use <ScrollView keyboardShouldPersistTaps="handled"> so taps register while the keyboard is open.
3. SIMPLE MOTION: prefer Tamagui animation / enterStyle / exitStyle / pressStyle (see the animations doc). Use Reanimated only for gesture-driven or continuous animation.
4. REANIMATED: import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from "react-native-reanimated". const x = useSharedValue(0); const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] })); set x.value = withTiming(100). Read/write .value only in handlers/effects/worklets, never in render.
5. GESTURES: import { GestureDetector, Gesture } from "react-native-gesture-handler". const pan = Gesture.Pan().onUpdate((e) => { x.value = e.translationX }); <GestureDetector gesture={pan}><Animated.View style={style} /></GestureDetector>. Do NOT use the legacy PanGestureHandler/Swipeable APIs.
6. IMAGES: <Image source={{ uri }} style={{ width, height }} /> from react-native is always available; bundle local assets with require("../assets/x.png"). For caching/blurhash, add "expo-image" to deps and import { Image } from "expo-image".
7. ACCESSIBILITY: give pressables accessibilityRole="button" and an accessibilityLabel; always label icon-only buttons so screen readers (and tests) can find them.`,
};

export const getRelevantDocs = (description: string, dependencies: string[]): string => {
  const docs = [KNOWLEDGE_BASE.tamaguiCore, KNOWLEDGE_BASE.designSystem];
  const text = (description + " " + dependencies.join(" ")).toLowerCase();

  if (text.match(/form|input|setting|switch|slider|check|radio/)) docs.push(KNOWLEDGE_BASE.forms);
  if (text.match(/sheet|dialog|modal|overlay|popup|toast/)) docs.push(KNOWLEDGE_BASE.overlays);
  if (text.match(/animat|bouncy|toggle|interactive|pressstyle|motion|smooth/)) docs.push(KNOWLEDGE_BASE.animations);
  if (text.match(/alpine|x-data|x-show|x-transition|accordion|dropdown|modal web|micro-?interaction/)) docs.push(KNOWLEDGE_BASE.alpineWeb);
  if (text.match(/tailwind|tailwindcss|hero|landing|marketing|template|dashboard|admin|card grid|pricing|auth form/)) docs.push(KNOWLEDGE_BASE.tailwindTemplates);
  if (text.match(/save|persist|store|data|list|todo|note|task|track|history|favorite|expense|budget|item|record|crud|collection|sqlite|database|db|sql|offline/)) docs.push(KNOWLEDGE_BASE.persistence);
  if (text.match(/chart|stat|analytic|graph/)) docs.push(KNOWLEDGE_BASE.charts);
  if (text.match(/navigat|route|router|screen|tabs|stack|link|expo-router|back button/)) docs.push(KNOWLEDGE_BASE.navigation);
  if (text.match(/flatlist|sectionlist|feed|infinite|pagination|long list|scroll list|render list/)) docs.push(KNOWLEDGE_BASE.lists);
  if (text.match(/zustand|global state|shared state|state management|app store/)) docs.push(KNOWLEDGE_BASE.stateZustand);
  if (text.match(/gesture|swipe|drag|reanimat|safe ?area|keyboard|image|photo|avatar|carousel/)) docs.push(KNOWLEDGE_BASE.gesturesMotion);

  return [...new Set(docs)].join("\n\n");
};
