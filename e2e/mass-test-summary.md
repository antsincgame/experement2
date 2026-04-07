# Mass Enhance E2E Summary

- Generated at: 2026-04-07T00:10:37.084Z
- Total prompts: 17
- Ready: 0
- Error: 17
- Timeout: 0
- WS error: 0
- Elapsed seconds: 2308

## Top Categories

- typescript_ts2322: 5 hits across 5 projects
- typescript_ts2304: 3 hits across 3 projects
- static_validation_failure: 1 hits across 1 projects
- other: 1 hits across 1 projects
- typescript_ts2339: 1 hits across 1 projects
- typescript_ts2769: 1 hits across 1 projects
- plan_validation: 1 hits across 1 projects
- typescript_ts2349: 1 hits across 1 projects
- typescript_ts2554: 1 hits across 1 projects

## Top Signatures

- TS2304:app/(tabs)/index.tsx(line,col): error TS2304: Cannot find name 'Task'. src/components/BottomSheetTaskCreator.tsx(line,col): error TS2304: Cannot find name 'Task'. src/components/Bo (1)
- TS2322:app/(tabs)/_layout.tsx(line,col): error TS2322: Type '"calculator"' is not assignable to type '"settings" | "italic" | "bold" | "divide" | "map" | "filter" | "search" | "repeat" |  (1)
- TS2322:src/components/CounterCard.tsx(line,col): error TS2322: Type '{ children: Element[]; bg: "$background"; borderRadius: number; p: "$<n>"; elevation: number; ai: "center"; jc: "cente (1)
- TS2304:src/hooks/useNotes.ts(line,col): error TS2304: Cannot find name 'Note'. (1)
- generic:Static validation failed: src/hooks/useHaptics.ts: import "@/stores/settingsStore" cannot be resolved from src/hooks/useHaptics.ts (1)
- generic:LLM error (<n>): <!DOCTYPE html> <html lang="en"> <head> <meta charset="utf-<n>"> <title>Error</title> </head> <body> <pre>Internal Server Error</pre> </body> </html> (1)
- TS2322:app/(tabs)/_layout.tsx(line,col): error TS2322: Type '"calculator"' is not assignable to type '"settings" | "italic" | "bold" | "map" | "filter" | "search" | "repeat" | "anchor" |  (1)
- TS2322:app/(tabs)/_layout.tsx(line,col): error TS2322: Type '"palette"' is not assignable to type '"settings" | "italic" | "bold" | "map" | "filter" | "search" | "repeat" | "anchor" | "li (1)
- TS2322:src/components/QuoteCard.tsx(line,col): error TS2322: Type '"heart" | "heart-outline"' is not assignable to type '"settings" | "italic" | "bold" | "map" | "filter" | "search" | "re (1)
- TS2339:app/(tabs)/index.tsx(line,col): error TS2339: Property 'name' does not exist on type 'never'. src/components/PrecipitationTimeline.tsx(line,col): error TS2339: Property 'hourlyFore (1)
- TS2304:app/(tabs)/add.tsx(line,col): error TS2304: Cannot find name 'Expense'. src/components/CategoryChart.tsx(line,col): error TS2769: No overload matches this call. Overload <n> of <n> (1)
- TS2769:src/components/TrendChart.tsx(line,col): error TS2769: No overload matches this call. Overload <n> of <n>, '(props: AbstractChartProps & LineChartProps): LineChart', gave the follo (1)
- generic:app/(tabs)/planner.tsx: dependency "src/components/MealPlanner.tsx" is missing from plan.files (1)
- TS2349:src/stores/workoutStore.ts(line,col): error TS2349: This expression is not callable. Type 'Omit<Set, "id">' has no call signatures. src/stores/workoutStore.ts(line,col): error TS70 (1)
- TS2554:src/components/DailyLogs.tsx(line,col): error TS2554: Expected <n>-<n> arguments, but got <n>. src/components/QuickLogBottomSheet.tsx(line,col): error TS2305: Module '"tamagui"' ha (1)

## Failed Projects

- 1. Todo list app: error :: Typecheck failed:
app/(tabs)/index.tsx(24,41): error TS2304: Cannot find name 'Task'.
src/components/BottomSheetTaskCreator.tsx(11,26): error TS2304: Cannot find name 'Task'.
src/components/BottomSheetTaskCreator.tsx(127,13): error TS2322: Type '"datetime"' is not assignable to type 'KeyboardTypeO
- 2. Simple calculator: error :: Typecheck failed:
app/(tabs)/_layout.tsx(12,22): error TS2322: Type '"calculator"' is not assignable to type '"settings" | "italic" | "bold" | "divide" | "map" | "filter" | "search" | "repeat" | "anchor" | "link" | "code" | "menu" | "video" | "circle" | "image" | "layout" | "key" | "type" | ... 268 
- 3. Pomodoro timer: error :: no captured error
- 4. Counter with increment and decrement: error :: Typecheck failed:
src/components/CounterCard.tsx(69,7): error TS2322: Type '{ children: Element[]; bg: "$background"; borderRadius: number; p: "$6"; elevation: number; ai: "center"; jc: "center"; gap: "$4"; w: "100%"; maxW: number; }' is not assignable to type 'IntrinsicAttributes & Omit<RNTamaguiVi
- 5. Note taking app: error :: Typecheck failed:
src/hooks/useNotes.ts(5,38): error TS2304: Cannot find name 'Note'.
- 6. Flashcard quiz app: error :: Static validation failed: src/hooks/useHaptics.ts: import "@/stores/settingsStore" cannot be resolved from src/hooks/useHaptics.ts
- 7. Unit converter: error :: LLM error (500): <!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Internal Server Error</pre>
</body>
</html>

- 8. Tip calculator: error :: Typecheck failed:
app/(tabs)/_layout.tsx(12,22): error TS2322: Type '"calculator"' is not assignable to type '"settings" | "italic" | "bold" | "map" | "filter" | "search" | "repeat" | "anchor" | "link" | "code" | "menu" | "video" | "circle" | "image" | "layout" | "key" | "type" | "radio" | ... 268 m
- 9. Color palette generator: error :: Typecheck failed:
app/(tabs)/_layout.tsx(12,22): error TS2322: Type '"palette"' is not assignable to type '"settings" | "italic" | "bold" | "map" | "filter" | "search" | "repeat" | "anchor" | "link" | "code" | "menu" | "video" | "circle" | "image" | "layout" | "key" | "type" | "radio" | ... 268 more
- 10. Random quote viewer: error :: Typecheck failed:
src/components/QuoteCard.tsx(49,13): error TS2322: Type '"heart" | "heart-outline"' is not assignable to type '"settings" | "italic" | "bold" | "map" | "filter" | "search" | "repeat" | "anchor" | "link" | "code" | "menu" | "video" | "circle" | "image" | "layout" | "key" | "type" | 
- 11. Weather dashboard: error :: Typecheck failed:
app/(tabs)/index.tsx(17,39): error TS2339: Property 'name' does not exist on type 'never'.
src/components/PrecipitationTimeline.tsx(15,36): error TS2339: Property 'hourlyForecast' does not exist on type 'never'.
src/components/PrecipitationTimeline.tsx(32,38): error TS2339: Prope
- 12. Expense tracker: error :: Typecheck failed:
app/(tabs)/add.tsx(10,47): error TS2304: Cannot find name 'Expense'.
src/components/CategoryChart.tsx(63,10): error TS2769: No overload matches this call.
  Overload 1 of 2, '(props: AbstractChartProps & BarChartProps): BarChart', gave the following error.
    Property 'yAxisSuf
- 13. Habit tracker with streaks: error :: Typecheck failed:
src/components/TrendChart.tsx(44,7): error TS2769: No overload matches this call.
  Overload 1 of 2, '(props: AbstractChartProps & LineChartProps): LineChart', gave the following error.
    Type '{ data: { labels: string[]; datasets: { data: number[]; color: (opacity?: number) =>
- 14. Recipe book app: error :: Plan validation failed: app/(tabs)/planner.tsx: dependency "src/components/MealPlanner.tsx" is missing from plan.files
- 15. Workout log tracker: error :: Typecheck failed:
src/stores/workoutStore.ts(104,9): error TS2349: This expression is not callable.
  Type 'Omit<Set, "id">' has no call signatures.
src/stores/workoutStore.ts(104,14): error TS7006: Parameter 'state' implicitly has an 'any' type.
src/stores/workoutStore.ts(105,41): error TS7006: 
- 16. Mood diary with calendar: error :: Typecheck failed:
src/components/DailyLogs.tsx(19,6): error TS2554: Expected 0-1 arguments, but got 2.
src/components/QuickLogBottomSheet.tsx(2,40): error TS2305: Module '"tamagui"' has no exported member 'Pressable'.
- 17. Book reading tracker: error :: no captured error