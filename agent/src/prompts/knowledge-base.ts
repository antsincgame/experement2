// Dynamic RAG knowledge base — injects only relevant API docs into the generator prompt.

export const KNOWLEDGE_BASE = {
  tamaguiCore: `## 📚 RAG DOCS: TAMAGUI V2 CORE
1. Layout: Use <YStack> (vertical flex), <XStack> (horizontal flex), <ZStack> (absolute). NEVER use View.
2. Text: Use <Text> from "tamagui". NEVER use react-native Text.
3. Spacing/Sizing: p="$4", px="$2", m="$4", w="100%", h="$4", flex={1}, gap="$2".
4. Colors: backgroundColor="$background", color="$color", borderColor="$borderColor".
5. Borders: borderWidth={1} (NUMBER, not boolean), borderRadius="$4". NEVER use "bordered" prop.
6. Buttons: <Button theme="active" size="$4" onPress={fn}>Text</Button>.
7. Cards: Build with <YStack backgroundColor="$background" borderRadius="$4" padding="$4" elevation={2} borderWidth={1} borderColor="$borderColor">. NEVER use Card.Body/Header/Footer.
8. Pressable: NEVER import Pressable from "tamagui" (it does NOT exist there). Import from "react-native": import { Pressable } from "react-native". Or better: use <Button> from tamagui instead.
9. ScrollView: Import from "tamagui", NOT from "react-native".
10. COLORS: NEVER use hex strings (like "#FF0000") in Tamagui props like color or backgroundColor. ONLY use tokens: "$background", "$color", "$primary", "$blue10", "$red10", "$green10", "$gray10".
11. THEME: <Theme name="light"> or <Theme name="dark"> ONLY. NEVER custom names like "active", "default", "primary". For conditional styling, use inline props: backgroundColor={isActive ? "$blue5" : "$gray3"}, NOT theme="active".
12. TYPES: If you use a custom type (like Habit, Todo, Expense), you MUST import it: import type { Habit } from "@/types/index".`,

  forms: `## 📚 RAG DOCS: TAMAGUI FORMS & INPUTS
1. Inputs: <Input size="$4" placeholder="Type here" borderWidth={1} borderColor="$borderColor" value={val} onChangeText={setVal} />
2. Switches (CRITICAL): Tamagui Switch uses 'checked' and 'onCheckedChange', NOT value/onValueChange!
   CORRECT:
   <Switch size="$4" checked={isEnabled} onCheckedChange={(val: boolean) => setIsEnabled(val)}>
     <Switch.Thumb animation="bouncy" />
   </Switch>
   WRONG: <Switch value={isEnabled} onValueChange={setIsEnabled} /> — THIS CRASHES!
3. Date Picking: NEVER use DatePickerIOS or DatePickerAndroid. Use a simple <Input placeholder="YYYY-MM-DD" />.
4. Labels: Use <Text> or <H2> above inputs for labels. No <Label> component.`,

  charts: `## 📚 RAG DOCS: REACT-NATIVE-CHART-KIT (CRITICAL TYPES)
DO NOT invent custom interfaces like 'ChartDataPoint' or 'ChartData'. The 'data' prop MUST EXACTLY match:
{
  labels: string[],
  datasets: { data: number[], color?: (opacity: number) => string, strokeWidth?: number }[]
}
Do NOT add extra properties to datasets (no 'colors', no 'barColors', no 'label').

LineChart example:
<LineChart
  data={{ labels: ["Jan", "Feb"], datasets: [{ data: [20, 40] }] }}
  width={Dimensions.get("window").width - 32}
  height={220}
  chartConfig={{ backgroundColor: "#fff", backgroundGradientFrom: "#fff", backgroundGradientTo: "#fff", color: (opacity = 1) => \`rgba(0, 0, 0, \${opacity})\`, decimalCount: 0 }}
  bezier
  style={{ borderRadius: 16 }}
/>

PieChart example:
<PieChart
  data={[{ name: "Food", amount: 50, color: "#FF6384", legendFontColor: "#333", legendFontSize: 12 }]}
  width={Dimensions.get("window").width - 32}
  height={220}
  chartConfig={{ color: (opacity = 1) => \`rgba(0,0,0,\${opacity})\` }}
  accessor="amount"
  backgroundColor="transparent"
/>`,

  advancedUI: `## 📚 RAG DOCS: TAMAGUI ADVANCED UI & ANIMATIONS
1. **Animations & Interactions**: Use \`animation="bouncy"\` (or "lazy") on YStack/XStack/Button.
   Use \`pressStyle={{ scale: 0.97, opacity: 0.8 }}\` and \`hoverStyle={{ opacity: 0.9 }}\` for tactile feedback.
   Use \`enterStyle={{ opacity: 0, y: 10 }}\` and \`exitStyle={{ opacity: 0, y: -10 }}\` for smooth mounting.
2. **ToggleGroup**:
   <ToggleGroup type="single" value={val} onValueChange={setVal} orientation="horizontal" disableDeactivation>
     <ToggleGroup.Item value="a"><Text>Option A</Text></ToggleGroup.Item>
     <ToggleGroup.Item value="b"><Text>Option B</Text></ToggleGroup.Item>
   </ToggleGroup>
3. **ThemeInverse**: Wrap contrasting sections in \`<ThemeInverse>\` to automatically invert light/dark tokens.`,

  overlays: `## 📚 RAG DOCS: TAMAGUI OVERLAYS (Sheet & Dialog)
1. **Sheet (Bottom Sheet)**: MUST include Overlay, Handle, and Frame.
   <Sheet modal open={isOpen} onOpenChange={setIsOpen} snapPoints={[50, 25]} dismissOnSnapToBottom position={0} animation="bouncy">
     <Sheet.Overlay animation="lazy" enterStyle={{ opacity: 0 }} exitStyle={{ opacity: 0 }} />
     <Sheet.Handle />
     <Sheet.Frame padding="$4" alignItems="center" justifyContent="center">
       <Text>Sheet Content</Text>
     </Sheet.Frame>
   </Sheet>
2. **Dialog**: MUST include Portal, Overlay, and Content.
   <Dialog modal open={isOpen} onOpenChange={setIsOpen}>
     <Dialog.Portal>
       <Dialog.Overlay key="overlay" animation="quick" enterStyle={{ opacity: 0 }} exitStyle={{ opacity: 0 }} />
       <Dialog.Content key="content" animation="bouncy" enterStyle={{ x: 0, y: -20, opacity: 0 }} exitStyle={{ x: 0, y: 10, opacity: 0 }}>
         <Text>Dialog Content</Text>
       </Dialog.Content>
     </Dialog.Portal>
   </Dialog>`,
};

export const getRelevantDocs = (description: string, dependencies: string[]): string => {
  const docs = [KNOWLEDGE_BASE.tamaguiCore];
  const text = (description + " " + dependencies.join(" ")).toLowerCase();

  if (text.includes("form") || text.includes("input") || text.includes("setting") || text.includes("switch") || text.includes("toggle") || text.includes("modal")) {
    docs.push(KNOWLEDGE_BASE.forms);
  }
  if (text.includes("chart") || text.includes("stat") || text.includes("analytic") || text.includes("graph") || text.includes("pie") || text.includes("bar") || text.includes("line")) {
    docs.push(KNOWLEDGE_BASE.charts);
  }
  if (text.includes("animat") || text.includes("bouncy") || text.includes("toggle") || text.includes("interactive") || text.includes("pressstyle") || text.includes("themeinverse")) {
    docs.push(KNOWLEDGE_BASE.advancedUI);
  }
  if (text.includes("sheet") || text.includes("bottom sheet") || text.includes("dialog") || text.includes("modal") || text.includes("overlay")) {
    docs.push(KNOWLEDGE_BASE.overlays);
  }

  return docs.join("\n\n");
};
