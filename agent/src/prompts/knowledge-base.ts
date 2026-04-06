// Surgical RAG knowledge base — token-optimized API snippets injected per-file by keyword matching.

export const KNOWLEDGE_BASE = {
  tamaguiCore: `## 📚 RAG DOCS: TAMAGUI V2 CORE (CRITICAL)
1. LAYOUT: ALWAYS use <YStack> (col), <XStack> (row), <ZStack> (absolute). NEVER use React Native View. Use \`separator={<Separator />}\` for lists.
2. TEXT: Use <Text>, <Paragraph>, <H1>-<H6>. NEVER use React Native Text.
3. TOKENS: p="$4", m="$2", gap="$3", br="$4", w="100%", h="$4", flex={1}.
4. COLORS: bg="$background", color="$color", borderColor="$borderColor". NEVER use hex strings like "#FFF".
5. BORDERS: borderWidth={1} (or bw={1}). NEVER use boolean 'bordered'.
6. THEMING: Use <ThemeInverse> to automatically invert colors for a section.
7. COMPONENTS: <Button backgroundColor="$primary" size="$4">Text</Button>. NEVER use the 'theme' prop on ANY component (it causes TS2322 errors). Use direct color props instead.
8. ICONS: Use @expo/vector-icons/Feather. Pass color and size. NEVER wrap icons in <ThemeInverse>.
9. PRESSABLE: NEVER import Pressable from "tamagui". Import from "react-native" or use <Button>.
10. TYPES: If you use a custom type (like Todo), you MUST import it: import type { Todo } from "@/types/index".
11. THEME NAME: <Theme name="light"> or <Theme name="dark"> ONLY. For conditional styling use inline props: bg={isActive ? "$blue5" : "$gray3"}.`,

  forms: `## 📚 RAG DOCS: TAMAGUI FORMS & INPUTS
1. INPUTS: <Input placeholder="Type..." bw={1} bc="$borderColor" /> or <TextArea />.
2. SWITCH: MUST use 'checked' and 'onCheckedChange' (NOT value/onChange).
   <Switch size="$4" checked={val} onCheckedChange={setVal}><Switch.Thumb animation="bouncy" /></Switch>
3. SLIDER: <Slider defaultValue={[50]} max={100} step={1}><Slider.Track><Slider.TrackActive /></Slider.Track><Slider.Thumb index={0} /></Slider>
4. RADIO/CHECKBOX: Use native Tamagui <RadioGroup> or <Checkbox>.
5. DATE: NEVER use DatePickerIOS/Android. Use a formatted <Input placeholder="YYYY-MM-DD" />.`,

  overlays: `## 📚 RAG DOCS: TAMAGUI OVERLAYS (Sheet, Dialog, Toast)
1. SHEET (Bottom Sheet): Import Sheet from "tamagui". Use COMPOUND syntax (Sheet.Overlay, Sheet.Handle, Sheet.Frame). NEVER import SheetHandle/SheetFrame/SheetOverlay separately. Do NOT use animation prop on Sheet (it does not exist). Do NOT use animation on Sheet.Overlay.
   <Sheet modal open={open} onOpenChange={setOpen} snapPoints={[50]} position={0} dismissOnSnapToBottom>
     <Sheet.Overlay />
     <Sheet.Handle />
     <Sheet.Frame p="$4"><Text>Content</Text></Sheet.Frame>
   </Sheet>
2. DIALOG (Modal): Import Dialog from "tamagui". Use COMPOUND syntax (Dialog.Portal, Dialog.Overlay, Dialog.Content).
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

  sqlite: `## 📚 RAG DOCS: EXPO-SQLITE (MODERN API SDK 51+)
NEVER use .transaction() or .executeSql(). They WILL CRASH.
1. INIT: \`const db = SQLite.openDatabaseSync('db.db');\`
2. WRITE: \`await db.runAsync('INSERT INTO t (col) VALUES (?)', ['val']);\`
3. READ: \`const rows = await db.getAllAsync('SELECT * FROM t');\`
4. DDL: \`await db.execAsync('CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY);');\``,

  charts: `## 📚 RAG DOCS: REACT-NATIVE-CHART-KIT
The 'data' prop MUST exactly match this TS interface to prevent TS2322:
{ labels: string[], datasets: { data: number[], color?: (opacity: number) => string, strokeWidth?: number }[] }
Example: <LineChart data={{ labels: ["A"], datasets: [{ data: [1] }] }} width={300} height={200} chartConfig={{ backgroundColor: "#fff", color: (o = 1) => \`rgba(0,0,0,\${o})\` }} />`,
};

export const getRelevantDocs = (description: string, dependencies: string[]): string => {
  const docs = [KNOWLEDGE_BASE.tamaguiCore];
  const text = (description + " " + dependencies.join(" ")).toLowerCase();

  if (text.match(/form|input|setting|switch|slider|check|radio/)) docs.push(KNOWLEDGE_BASE.forms);
  if (text.match(/sheet|dialog|modal|overlay|popup|toast/)) docs.push(KNOWLEDGE_BASE.overlays);
  if (text.match(/animat|bouncy|toggle|interactive|pressstyle|motion|smooth/)) docs.push(KNOWLEDGE_BASE.animations);
  if (text.match(/sqlite|database|db|sql|offline/)) docs.push(KNOWLEDGE_BASE.sqlite);
  if (text.match(/chart|stat|analytic|graph/)) docs.push(KNOWLEDGE_BASE.charts);

  return docs.join("\n\n");
};
