import { YStack, Text } from "tamagui";
import ConverterScreen from "@/components/ConverterScreen";
import useCategories from "@/hooks/useCategories";
import type { Category } from "@/types/index";

export default function HomeScreen() {
  const { categories, loading, error } = useCategories();

  if (loading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center">
        <Text>Loading categories...</Text>
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center">
        <Text color="red">Error: {error}</Text>
      </YStack>
    );
  }

  return <ConverterScreen categories={categories} />;
}

// EOF