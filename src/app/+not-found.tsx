import { Link, Stack } from "expo-router";
import { View, Text } from "react-native";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not Found" }} />
      <View className="flex-1 bg-cyber-bg items-center justify-center">
        <Text className="text-neon-pink text-2xl font-bold">404</Text>
        <Text className="text-white/60 mt-2">Экран не найден</Text>
        <Link href="/" className="mt-4">
          <Text className="text-neon-cyan underline">На главную</Text>
        </Link>
      </View>
    </>
  );
}
