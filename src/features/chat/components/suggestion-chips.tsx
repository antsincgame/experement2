import { View, Text, Pressable, ScrollView } from "react-native";
import { ListTodo, Cloud, StickyNote, DollarSign, Timer, Target } from "lucide-react-native";
import type { FC } from "react";

interface SuggestionChipsProps {
  onSelect: (text: string) => void;
}

const SUGGESTIONS = [
  { icon: ListTodo, label: "Todo App", prompt: "Todo app with categories, priorities, and dark mode", color: "#00E5FF" },
  { icon: Cloud, label: "Weather", prompt: "Weather app showing current weather and 5-day forecast", color: "#7C4DFF" },
  { icon: StickyNote, label: "Notes", prompt: "Notes app with markdown support and local storage", color: "#FF2DAA" },
  { icon: DollarSign, label: "Expenses", prompt: "Expense tracker with categories and monthly charts", color: "#00FF88" },
  { icon: Timer, label: "Pomodoro", prompt: "Pomodoro timer with task list and statistics", color: "#FFD700" },
  { icon: Target, label: "Habits", prompt: "Habit tracker with daily streaks and progress charts", color: "#FF3366" },
] as const;

const SuggestionChips: FC<SuggestionChipsProps> = ({ onSelect }) => (
  <View className="mt-8 items-center">
    <Text className="text-ink-faint text-[10px] uppercase tracking-widest mb-3 font-medium">
      Quick start
    </Text>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
    >
      {SUGGESTIONS.map((s) => {
        const Icon = s.icon;
        return (
          <Pressable
            key={s.label}
            onPress={() => onSelect(s.prompt)}
            className="flex-row items-center gap-2 rounded-full px-4 py-2.5"
            style={{
              backgroundColor: "rgba(26, 26, 46, 0.6)",
              borderWidth: 1,
              borderColor: "rgba(255, 215, 0, 0.12)",
              shadowColor: s.color,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 8,
            }}
          >
            <Icon size={14} color={s.color} strokeWidth={1.5} />
            <Text className="text-ink-faint text-xs font-medium">{s.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  </View>
);

export default SuggestionChips;
