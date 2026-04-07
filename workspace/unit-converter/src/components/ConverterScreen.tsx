import { useState } from "react";
import { YStack, XStack, Text, Input, Button, ScrollView } from "tamagui";
import useConverter from "@/hooks/useConverter";
import type { Unit, Category } from "@/types/index";

interface ConverterScreenProps {
  categories: Category[];
}

export default function ConverterScreen({ categories }: ConverterScreenProps) {
  const {
    fromUnit,
    toUnit,
    inputValue,
    resultValue,
    selectedCategory,
    isConverting,
    handleFromUnitChange,
    handleToUnitChange,
    handleInputChange,
    handleCategoryChange,
    handleReset
  } = useConverter();

  const [isSwapping, setIsSwapping] = useState(false);

  const swapUnits = () => {
    if (!fromUnit || !toUnit) return;
    
    setIsSwapping(true);
    setTimeout(() => {
      handleFromUnitChange(toUnit);
      handleToUnitChange(fromUnit);
      setIsSwapping(false);
    }, 150);
  };

  const getUnitOptions = (category: Category | null) => {
    if (!category) return [];
    return category.units;
  };

  const formatResult = (value: string) => {
    if (!value) return "";
    
    // Format large numbers with commas
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    
    // For very small or large numbers, use scientific notation
    if (Math.abs(num) < 0.000001 || Math.abs(num) > 999999999) {
      return num.toExponential(6);
    }
    
    // Format with commas and limit decimal places
    const [integer, decimal] = value.split('.');
    if (!decimal) return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    
    return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decimal.substring(0, 6)}`;
  };

  return (
    <ScrollView padding="$4" flex={1}>
      <YStack space="$4" padding="$4">
        <Text fontSize="$8" fontWeight="bold" textAlign="center">
          Unit Converter
        </Text>
        
        {/* Category Selection */}
        <YStack space="$2">
          <Text fontSize="$3" color="$secondaryText">Select Category</Text>
          <XStack flexWrap="wrap" gap="$2">
            {categories.map((category) => (
              <Button
                key={category.id}
                size="$3"
                backgroundColor={
                  selectedCategory?.id === category.id ? "$primary" : "$background"
                }
                color={
                  selectedCategory?.id === category.id ? "$background" : "$primaryText"
                }
                onPress={() => handleCategoryChange(category)}
                borderWidth={1}
                borderColor="$borderColor"
              >
                <Text fontSize="$3">{category.name}</Text>
              </Button>
            ))}
          </XStack>
        </YStack>

        {/* Conversion Inputs */}
        {selectedCategory && (
          <YStack space="$4">
            <YStack space="$2">
              <Text fontSize="$3" color="$secondaryText">From</Text>
              <XStack alignItems="center" gap="$2">
                <Input
                  flex={1}
                  placeholder="Enter value"
                  value={inputValue}
                  onChangeText={handleInputChange}
                  keyboardType="numeric"
                  borderWidth={1}
                  borderColor="$borderColor"
                  padding="$3"
                />
                <Button
                  size="$4"
                  onPress={() => {
                    const units = getUnitOptions(selectedCategory);
                    if (units.length > 0) {
                      handleFromUnitChange(units[0]);
                    }
                  }}
                  backgroundColor="$background"
                  borderWidth={1}
                  borderColor="$borderColor"
                >
                  <Text fontSize="$3">
                    {fromUnit ? fromUnit.abbreviation : "Select"}
                  </Text>
                </Button>
              </XStack>
            </YStack>

            {/* Swap Button */}
            <XStack justifyContent="center">
              <Button
                size="$4"
                onPress={swapUnits}
                disabled={!fromUnit || !toUnit}
                backgroundColor="$background"
                borderWidth={1}
                borderColor="$borderColor"
                animation="bouncy"
                scale={isSwapping ? 0.9 : 1}
              >
                <Text fontSize="$3">Swap</Text>
              </Button>
            </XStack>

            <YStack space="$2">
              <Text fontSize="$3" color="$secondaryText">To</Text>
              <XStack alignItems="center" gap="$2">
                <Input
                  flex={1}
                  placeholder="Result"
                  value={formatResult(resultValue)}
                  editable={false}
                  borderWidth={1}
                  borderColor="$borderColor"
                  padding="$3"
                />
                <Button
                  size="$4"
                  onPress={() => {
                    const units = getUnitOptions(selectedCategory);
                    if (units.length > 0) {
                      handleToUnitChange(units[0]);
                    }
                  }}
                  backgroundColor="$background"
                  borderWidth={1}
                  borderColor="$borderColor"
                >
                  <Text fontSize="$3">
                    {toUnit ? toUnit.abbreviation : "Select"}
                  </Text>
                </Button>
              </XStack>
            </YStack>

            {/* Conversion Status */}
            {isConverting && (
              <YStack alignItems="center" padding="$2">
                <Text fontSize="$2" color="$secondaryText">Converting...</Text>
              </YStack>
            )}
          </YStack>
        )}

        {/* Reset Button */}
        <Button
          size="$4"
          onPress={handleReset}
          backgroundColor="$background"
          borderWidth={1}
          borderColor="$borderColor"
        >
          <Text fontSize="$3" color="$primary">Reset</Text>
        </Button>
      </YStack>
    </ScrollView>
  );
}

// EOF