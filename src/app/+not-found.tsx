import { Link, Stack } from "expo-router";
import { View, Text } from "react-native";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not Found" }} />
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: "#0A0A0A" }}>
        <Text style={{ color: "#FFD700", fontSize: 48, fontWeight: "700", letterSpacing: 6 }}>404</Text>
        <Text style={{ color: "#8888AA", marginTop: 8 }}>Screen not found</Text>
        <Link href="/" className="mt-4">
          <Text style={{ color: "#00E5FF", textDecorationLine: "underline" }}>Go home</Text>
        </Link>
      </View>
    </>
  );
}
