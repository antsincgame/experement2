import { useState, useEffect } from "react";
import { useConverterStore } from "@/stores/converterStore";
import type { Unit, Category } from "@/types/index";

export default function useConverter() {
  const {
    fromUnit,
    toUnit,
    inputValue,
    resultValue,
    selectedCategory,
    setFromUnit,
    setToUnit,
    setInputValue,
    setResultValue,
    setSelectedCategory,
    convert,
    reset
  } = useConverterStore();

  const [isConverting, setIsConverting] = useState(false);

  useEffect(() => {
    if (inputValue.trim() !== "") {
      setIsConverting(true);
      convert();
    } else {
      setResultValue("");
      setIsConverting(false);
    }
  }, [inputValue, fromUnit, toUnit]);

  const handleFromUnitChange = (unit: Unit | null) => {
    setFromUnit(unit);
  };

  const handleToUnitChange = (unit: Unit | null) => {
    setToUnit(unit);
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);
  };

  const handleCategoryChange = (category: Category | null) => {
    setSelectedCategory(category);
    // Reset units when category changes
    setFromUnit(null);
    setToUnit(null);
  };

  const handleReset = () => {
    reset();
  };

  return {
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
  };
}

// EOF