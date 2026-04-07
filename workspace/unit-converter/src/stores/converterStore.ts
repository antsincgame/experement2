import { create } from "zustand";
import type { Unit, Category, ConverterState } from "@/types/index";

interface ConverterStore extends ConverterState {
  setFromUnit: (unit: Unit | null) => void;
  setToUnit: (unit: Unit | null) => void;
  setInputValue: (value: string) => void;
  setResultValue: (value: string) => void;
  setSelectedCategory: (category: Category | null) => void;
  convert: () => void;
  reset: () => void;
}

export const useConverterStore = create<ConverterStore>((set, get) => ({
  fromUnit: null,
  toUnit: null,
  inputValue: "",
  resultValue: "",
  selectedCategory: null,
  
  setFromUnit: (unit) => set({ fromUnit: unit }),
  setToUnit: (unit) => set({ toUnit: unit }),
  setInputValue: (value) => set({ inputValue: value }),
  setResultValue: (value) => set({ resultValue: value }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  
  convert: () => {
    const { fromUnit, toUnit, inputValue, selectedCategory } = get();
    
    if (!fromUnit || !toUnit || !inputValue) {
      set({ resultValue: "" });
      return;
    }
    
    // Convert input to base unit (assuming all units have a conversion factor)
    const inputValueNum = parseFloat(inputValue);
    if (isNaN(inputValueNum)) {
      set({ resultValue: "Invalid input" });
      return;
    }
    
    // Convert to base unit first
    const baseValue = inputValueNum * fromUnit.conversionFactor;
    
    // Convert from base unit to target unit
    const result = baseValue / toUnit.conversionFactor;
    
    set({ resultValue: result.toString() });
  },
  
  reset: () => {
    set({
      fromUnit: null,
      toUnit: null,
      inputValue: "",
      resultValue: "",
      selectedCategory: null
    });
  }
}));

// EOF