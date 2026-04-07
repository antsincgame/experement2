# Grand Soak Test v2 — Report

Generated: 2026-04-07T18:32:06.346Z
Elapsed: 6959s (~116min)
Model: qwen/qwen3-coder-30b | Enhancer: google/gemma-4-26b-a4b

## Global Win Rate

| Status | Count | Rate |
|--------|-------|------|
| READY  | 0 | **0%** |
| ERROR  | 50 | 100% |
| TIMEOUT | 0 | 0% |
| WS_ERR | 0 | 0% |

## Auto-Fixer Effectiveness

- Total autofix attempts: 60
- Successful autofixes: 0
- Fix rate: 0%

## Error Classification (The Graveyard)

| Category | Count | Projects |
|----------|-------|----------|
| TS2322 | 19 | Simple calculator with history, Todo list with categories and priority, Unit converter for length, weight, temperature, Tip calculator with split bill, BMI calculator with result history, Workout log with exercise sets and reps, Sleep quality tracker with weekly chart, Step counter dashboard, Blood pressure log with trend chart, Pill reminder with schedule list, Yoga pose library with favorites, Shopping list with checkboxes, Recipe book with ingredients list, Password generator with strength meter, Task manager with drag-and-drop priority, Color palette generator with copy hex, Dice roller for board games, Plant watering reminder, App with local storage persistence |
| CONTRACT_VIOLATION | 14 | Simple calculator with history, Pomodoro timer with session tracking, BMI calculator with result history, Flashcard quiz app with spaced repetition, Flashcard quiz app with spaced repetition, Recipe book with ingredients list, Recipe book with ingredients list, Color palette generator with copy hex, Dice roller for board games, Pet care tracker with feeding schedule, App with form validation and error messages, App with form validation and error messages, App with form validation and error messages, App with animated card transitions |
| TS2304 | 7 | Pomodoro timer with session tracking, Habit tracker with daily streaks, Time zone converter, Random quote viewer with favorites, Emoji mood board creator, Birthday reminder with countdown, App with bottom sheet modal form |
| PLAN_VALIDATION | 3 | Savings goal tracker with progress ring, App with tabs and settings page, App with progress indicators and loading states |
| TS2552 | 2 | Expense tracker with pie chart, Meal calorie counter |
| OTHER | 2 | Daily gratitude journal, Personal budget planner with bar chart |
| TS2739 | 2 | Trivia quiz with multiple choice, App with onboarding walkthrough screens |
| TS2339 | 2 | App with form validation and error messages, App with animated card transitions |
| TS7006 | 1 | Note taking app with search |
| TS7016 | 1 | Mood diary with emoji ratings |
| TS2345 | 1 | Meditation timer with bell sound |
| TS2614 | 1 | Countdown events tracker |
| TS1700 | 1 | Flashcard quiz app with spaced repetition |
| TS2741 | 1 | Daily affirmation app with swipe cards |
| TS2353 | 1 | Pet care tracker with feeding schedule |
| TS2774 | 1 | App with dark mode toggle in settings |
| TS2551 | 1 | App with swipe-to-delete list items |

### Error Samples

**TS2322:** `Typecheck failed: app/(tabs)/_layout.tsx(L,C): error TS2322: Type '"calculator"' is not assignable to type '"settings" | "italic" | "bold" | "map" | "filter" | "search" | "repeat" | "anchor" | "link" | "code" | "menu" | "video" | "circle" | "image" | "layout" | "key" | "type" | "radio" | ... 268 mor`

**CONTRACT_VIOLATION:** `Contract violations in src/hooks/useCalculator.ts after 2 retries: Hook 'useCalculatorStore' does not return key 'displayValue'. Available: [setInputValue, setDisplayValue, setOperator, setPreviousValue, setIsCalculated, setMode, clear, clearEntry, toggleSign, percentage, calculate, handleNumberInpu`

**TS2304:** `Typecheck failed: src/hooks/usePomodoroTimer.ts(L,C): error TS2304: Cannot find name 'isRunning'. src/hooks/usePomodoroTimer.ts(L,C): error TS2304: Cannot find name 'isRunning'. src/hooks/usePomodoroTimer.ts(L,C): error TS2304: Cannot find name 'timeLeft'. src/hooks/usePomodoroTimer.ts(L,C): error T`

**PLAN_VALIDATION:** `Plan validation failed: src/components/ProgressRing.tsx: dependency "src/hooks/useTheme.ts" is missing from plan.files`

**TS2552:** `Typecheck failed: app/(tabs)/index.tsx(L,C): error TS2552: Cannot find name 'Transaction'. Did you mean 'IDBTransaction'? app/(tabs)/index.tsx(L,C): error TS2322: Type '{ open: boolean; setOpen: Dispatch<SetStateAction<boolean>>; onSubmit: (transactionData: Omit<Transaction, "id">) => void; }' is no`

**OTHER:** `Typecheck failed: Overload 1 of 2, '(props: AbstractChartProps & LineChartProps): LineChart', gave the following error. Type '{ data: { labels: string[]; datasets: { data: number[]; color: (opacity?: number) => string; strokeWidth: number; }[]; }; width: number; height: number; chartConfig: { backgr`

**TS2739:** `Typecheck failed: src/components/QuestionCard.tsx(L,C): error TS2739: Type '{ timeRemaining: number; }' is missing the following properties from type 'ProgressBarProps': question, totalTime src/components/QuestionCard.tsx(L,C): error TS2367: This comparison appears to be unintentional because the ty`

**TS2339:** `Typecheck failed: src/stores/onboardingStore.ts(L,C): error TS2339: Property 'replace' does not exist on type 'string | string[] | { email: boolean; push: boolean; sms: boolean; }'. Property 'replace' does not exist on type 'string[]'. src/stores/onboardingStore.ts(L,C): error TS2769: No overload ma`

**TS7006:** `Typecheck failed: Property 'onTagToggle' does not exist on type 'IntrinsicAttributes & TagFilterProps'. app/modal/search.tsx(L,C): error TS7006: Parameter 'tag' implicitly has an 'any' type. src/components/Dashboard.tsx(L,C): error TS2322: Type '{ key: string; folder: Folder; onPress: () => void; }'`

**TS7016:** `Typecheck failed: src/components/MoodChart.tsx(L,C): error TS7016: Could not find a declaration file for module 'react-native-svg-charts'. '<ws>' implicitly has an 'any' type. Try `npm i --save-dev @types/react-native-svg-charts` if it exists or add a new declaration (.d.ts) file containing `declare`

## Successful Projects


## Failed Projects

- 1. Simple calculator with history: **error** — Contract violations in src/hooks/useCalculator.ts after 2 retries: Hook 'useCalculatorStore' does not return key 'displa
- 2. Todo list with categories and priority: **error** — Typecheck failed: app/(tabs)/categories.tsx(L,C): error TS2322: Type '{ children: string; flex: number; fontSize: "$3"; 
- 3. Pomodoro timer with session tracking: **error** — Contract violations in app/(tabs)/settings.tsx after 2 retries: 'TimerSettings' imported as default but is a named expor
- 4. Note taking app with search: **error** — Typecheck failed: Property 'onTagToggle' does not exist on type 'IntrinsicAttributes & TagFilterProps'. app/modal/search
- 5. Unit converter for length, weight, temperature: **error** — Typecheck failed: app/(tabs)/_layout.tsx(L,C): error TS2322: Type '"calculator"' is not assignable to type '"settings" |
- 6. Tip calculator with split bill: **error** — Typecheck failed: app/(tabs)/_layout.tsx(L,C): error TS2322: Type '"calculator"' is not assignable to type '"settings" |
- 7. Expense tracker with pie chart: **error** — Typecheck failed: app/(tabs)/index.tsx(L,C): error TS2552: Cannot find name 'Transaction'. Did you mean 'IDBTransaction'
- 8. Habit tracker with daily streaks: **error** — Typecheck failed: app/(tabs)/settings.tsx(L,C): error TS2304: Cannot find name 'SettingsState'. src/components/SettingsF
- 9. Water intake tracker with daily goal: **error** — no error captured
- 10. BMI calculator with result history: **error** — Contract violations in src/hooks/useBMIHistory.ts after 2 retries: Hook 'useBMIStore' does not return key 'history'. Ava
- 11. Workout log with exercise sets and reps: **error** — Typecheck failed: src/components/DashboardScreen.tsx(L,C): error TS2322: Type '{ key: string; exercise: Exercise; onRemo
- 12. Meal calorie counter: **error** — Typecheck failed: app/(tabs)/index.tsx(L,C): error TS2552: Cannot find name 'XStack'. Did you mean 'YStack'? app/(tabs)/
- 13. Sleep quality tracker with weekly chart: **error** — Typecheck failed: src/components/SleepTrackerCard.tsx(L,C): error TS2322: Type '"date"' is not assignable to type 'Keybo
- 14. Mood diary with emoji ratings: **error** — Typecheck failed: src/components/MoodChart.tsx(L,C): error TS7016: Could not find a declaration file for module 'react-n
- 15. Step counter dashboard: **error** — Typecheck failed: src/components/MetricCard.tsx(L,C): error TS2322: Type 'string' is not assignable to type '"settings" 
- 16. Meditation timer with bell sound: **error** — Typecheck failed: src/components/BreathingTimer.tsx(L,C): error TS2345: Argument of type '"medium"' is not assignable to
- 17. Daily gratitude journal: **error** — Typecheck failed: Overload 1 of 2, '(props: AbstractChartProps & LineChartProps): LineChart', gave the following error. 
- 18. Blood pressure log with trend chart: **error** — Typecheck failed: app/(tabs)/index.tsx(L,C): error TS2322: Type '{ open: boolean; setOpen: Dispatch<SetStateAction<boole
- 19. Pill reminder with schedule list: **error** — Typecheck failed: app/(tabs)/_layout.tsx(L,C): error TS2322: Type '"pill"' is not assignable to type '"settings" | "ital
- 20. Yoga pose library with favorites: **error** — Typecheck failed: src/components/PoseCard.tsx(L,C): error TS2322: Type '"heart" | "heart-outline"' is not assignable to 
- 21. Personal budget planner with bar chart: **error** — Typecheck failed: Overload 1 of 2, '(props: AbstractChartProps & LineChartProps): LineChart', gave the following error. 
- 22. Countdown events tracker: **error** — Typecheck failed: src/components/AddEventBottomSheet.tsx(L,C): error TS2614: Module '"@expo/vector-icons/Feather"' has n
- 23. Flashcard quiz app with spaced repetition: **error** — Contract violations in app/(tabs)/index.tsx after 2 retries: 'StudySession' imported as default but is a named export
- 24. Shopping list with checkboxes: **error** — Typecheck failed: src/components/ShoppingListScreen.tsx(L,C): error TS2322: Type '{ key: string; item: ShoppingItem; onT
- 25. Recipe book with ingredients list: **error** — Contract violations in app/(tabs)/index.tsx after 2 retries: 'useRecipes' imported as default but is a named export
- 26. Book reading tracker with progress bar: **error** — no error captured
- 27. Password generator with strength meter: **error** — Typecheck failed: app/(tabs)/index.tsx(L,C): error TS2322: Type '{ score: number; label: "Calculating..."; color: string
- 28. Task manager with drag-and-drop priority: **error** — Typecheck failed: src/components/TaskItem.tsx(L,C): error TS2322: Type '{ fontSize: "$4"; borderBottomWidth: number; bor
- 29. Time zone converter: **error** — Typecheck failed: src/components/TimezoneTimeline.tsx(L,C): error TS2304: Cannot find name 'formatTimeForTimezone'.
- 30. Savings goal tracker with progress ring: **error** — Plan validation failed: src/components/ProgressRing.tsx: dependency "src/hooks/useTheme.ts" is missing from plan.files
- 31. Color palette generator with copy hex: **error** — Contract violations in app/(tabs)/history.tsx after 2 retries: 'PaletteHistory' imported as default but is a named expor
- 32. Random quote viewer with favorites: **error** — Typecheck failed: app/(tabs)/favorites.tsx(L,C): error TS2304: Cannot find name 'Favorite'. src/components/QuoteCard.tsx
- 33. Dice roller for board games: **error** — Contract violations in app/(tabs)/settings.tsx after 2 retries: 'DiceSettings' imported as default but is a named export
- 34. Scoreboard for card games: **error** — no error captured
- 35. Emoji mood board creator: **error** — Typecheck failed: app/(tabs)/settings.tsx(L,C): error TS2304: Cannot find name 'Settings'. src/components/MoodBoardGrid.
- 36. Daily affirmation app with swipe cards: **error** — Typecheck failed: src/components/SettingsForm.tsx(L,C): error TS2741: Property 'index' is missing in type '{ children: s
- 37. Trivia quiz with multiple choice: **error** — Typecheck failed: src/components/QuestionCard.tsx(L,C): error TS2739: Type '{ timeRemaining: number; }' is missing the f
- 38. Pet care tracker with feeding schedule: **error** — Contract violations in app/(tabs)/settings.tsx after 2 retries: 'NotificationSettings' imported as default but is a name
- 39. Plant watering reminder: **error** — Typecheck failed: app/(tabs)/_layout.tsx(L,C): error TS2322: Type '"leaf"' is not assignable to type '"settings" | "ital
- 40. Birthday reminder with countdown: **error** — Typecheck failed: app/(tabs)/add-birthday.tsx(L,C): error TS2304: Cannot find name 'Birthday'. app/(tabs)/index.tsx(L,C)
- 41. App with tabs and settings page: **error** — Plan validation failed: src/components/MainComponent.tsx: dependency "src/types/index.ts" is missing from plan.files; sr
- 42. App with search bar and filterable list: **error** — no error captured
- 43. App with form validation and error messages: **error** — Contract violations in src/components/OnboardingForm.tsx after 2 retries: 'useOnboardingStore' imported as default but i
- 44. App with dark mode toggle in settings: **error** — Typecheck failed: app/(tabs)/index.tsx(L,C): error TS2774: This condition will always return true since this function is
- 45. App with animated card transitions: **error** — Contract violations in src/components/AnimatedCard.tsx after 2 retries: 'useAnimationStore' imported as default but is a
- 46. App with local storage persistence: **error** — Typecheck failed: src/components/BottomSheetModal.tsx(L,C): error TS2322: Type 'Dispatch<SetStateAction<"medium" | "low"
- 47. App with swipe-to-delete list items: **error** — Typecheck failed: src/components/SwipeableListItem.tsx(L,C): error TS2551: Property 'value' does not exist on type 'numb
- 48. App with bottom sheet modal form: **error** — Typecheck failed: src/components/TaskCard.tsx(L,C): error TS2304: Cannot find name 'MotiView'. src/components/TaskCard.t
- 49. App with progress indicators and loading states: **error** — Plan validation failed: app/(tabs)/analytics.tsx: dependency "src/components/AnalyticsDashboard.tsx" is missing from pla
- 50. App with onboarding walkthrough screens: **error** — Typecheck failed: src/components/PreferencesScreen.tsx(L,C): error TS2739: Type '{ [x: string]: true; }' is missing the 

## Hardware Health

- Agent crashes: 0
- Timeouts (Metro hang): 0
- Total projects processed: 50