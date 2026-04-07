import { YStack, XStack, Text, Button } from "tamagui";
import { Category } from "@/types/index";

interface CategoriesListProps {
  categories: Category[];
  onSelectCategory: (category: Category) => void;
}

export default function CategoriesList({ 
  categories, 
  onSelectCategory 
}: CategoriesListProps) {
  return (
    <YStack padding="$4" gap="$3">
      {categories.length > 0 ? (
        categories.map((category) => (
          <Button
            key={category.id}
            onPress={() => onSelectCategory(category)}
            backgroundColor="$background"
            borderColor="$borderColor"
            borderWidth={1}
            borderRadius="$4"
            padding="$4"
            alignItems="center"
            justifyContent="center"
            hoverStyle={{
              backgroundColor: "$secondaryBackground",
            }}
            pressStyle={{
              backgroundColor: "$tertiaryBackground",
            }}
          >
            <Text fontSize="$5" color="$color">
              {category.name}
            </Text>
          </Button>
        ))
      ) : (
        <YStack alignItems="center" padding="$6">
          <Text color="$secondaryTextColor">No categories available</Text>
        </YStack>
      )}
    </YStack>
  );
}

// EOF