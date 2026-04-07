import { useState, useEffect } from "react";
import type { Category } from "@/types/index";

export default function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Simulate API call or data fetching
    const fetchCategories = () => {
      try {
        // In a real app, this would be an API call or database query
        const mockCategories: Category[] = [
          {
            id: "length",
            name: "Length",
            units: [
              { id: "meter", name: "Meter", abbreviation: "m", conversionFactor: 1 },
              { id: "kilometer", name: "Kilometer", abbreviation: "km", conversionFactor: 1000 },
              { id: "centimeter", name: "Centimeter", abbreviation: "cm", conversionFactor: 0.01 },
              { id: "millimeter", name: "Millimeter", abbreviation: "mm", conversionFactor: 0.001 },
              { id: "mile", name: "Mile", abbreviation: "mi", conversionFactor: 1609.34 },
              { id: "yard", name: "Yard", abbreviation: "yd", conversionFactor: 0.9144 },
              { id: "foot", name: "Foot", abbreviation: "ft", conversionFactor: 0.3048 },
              { id: "inch", name: "Inch", abbreviation: "in", conversionFactor: 0.0254 },
            ],
          },
          {
            id: "weight",
            name: "Weight",
            units: [
              { id: "kilogram", name: "Kilogram", abbreviation: "kg", conversionFactor: 1 },
              { id: "gram", name: "Gram", abbreviation: "g", conversionFactor: 0.001 },
              { id: "milligram", name: "Milligram", abbreviation: "mg", conversionFactor: 0.000001 },
              { id: "ton", name: "Tonne", abbreviation: "t", conversionFactor: 1000 },
              { id: "pound", name: "Pound", abbreviation: "lb", conversionFactor: 0.453592 },
              { id: "ounce", name: "Ounce", abbreviation: "oz", conversionFactor: 0.0283495 },
            ],
          },
          {
            id: "temperature",
            name: "Temperature",
            units: [
              { id: "celsius", name: "Celsius", abbreviation: "°C", conversionFactor: 1 },
              { id: "fahrenheit", name: "Fahrenheit", abbreviation: "°F", conversionFactor: 1 },
              { id: "kelvin", name: "Kelvin", abbreviation: "K", conversionFactor: 1 },
            ],
          },
          {
            id: "area",
            name: "Area",
            units: [
              { id: "square-meter", name: "Square Meter", abbreviation: "m²", conversionFactor: 1 },
              { id: "square-kilometer", name: "Square Kilometer", abbreviation: "km²", conversionFactor: 1000000 },
              { id: "square-centimeter", name: "Square Centimeter", abbreviation: "cm²", conversionFactor: 0.0001 },
              { id: "hectare", name: "Hectare", abbreviation: "ha", conversionFactor: 10000 },
              { id: "acre", name: "Acre", abbreviation: "ac", conversionFactor: 4046.86 },
              { id: "square-mile", name: "Square Mile", abbreviation: "mi²", conversionFactor: 2589988.11 },
              { id: "square-yard", name: "Square Yard", abbreviation: "yd²", conversionFactor: 0.836127 },
              { id: "square-foot", name: "Square Foot", abbreviation: "ft²", conversionFactor: 0.092903 },
              { id: "square-inch", name: "Square Inch", abbreviation: "in²", conversionFactor: 0.00064516 },
            ],
          },
          {
            id: "volume",
            name: "Volume",
            units: [
              { id: "liter", name: "Liter", abbreviation: "L", conversionFactor: 1 },
              { id: "milliliter", name: "Milliliter", abbreviation: "mL", conversionFactor: 0.001 },
              { id: "cubic-meter", name: "Cubic Meter", abbreviation: "m³", conversionFactor: 1000 },
              { id: "cubic-centimeter", name: "Cubic Centimeter", abbreviation: "cm³", conversionFactor: 0.001 },
              { id: "gallon", name: "Gallon", abbreviation: "gal", conversionFactor: 3.78541 },
              { id: "quart", name: "Quart", abbreviation: "qt", conversionFactor: 0.946353 },
              { id: "pint", name: "Pint", abbreviation: "pt", conversionFactor: 0.473176 },
              { id: "cup", name: "Cup", abbreviation: "cup", conversionFactor: 0.24 },
              { id: "fluid-ounce", name: "Fluid Ounce", abbreviation: "fl oz", conversionFactor: 0.0295735 },
              { id: "tablespoon", name: "Tablespoon", abbreviation: "tbsp", conversionFactor: 0.0147868 },
              { id: "teaspoon", name: "Teaspoon", abbreviation: "tsp", conversionFactor: 0.00492892 },
            ],
          },
          {
            id: "time",
            name: "Time",
            units: [
              { id: "second", name: "Second", abbreviation: "s", conversionFactor: 1 },
              { id: "millisecond", name: "Millisecond", abbreviation: "ms", conversionFactor: 0.001 },
              { id: "microsecond", name: "Microsecond", abbreviation: "μs", conversionFactor: 0.000001 },
              { id: "minute", name: "Minute", abbreviation: "min", conversionFactor: 60 },
              { id: "hour", name: "Hour", abbreviation: "hr", conversionFactor: 3600 },
              { id: "day", name: "Day", abbreviation: "d", conversionFactor: 86400 },
              { id: "week", name: "Week", abbreviation: "wk", conversionFactor: 604800 },
              { id: "month", name: "Month", abbreviation: "mo", conversionFactor: 2628000 },
              { id: "year", name: "Year", abbreviation: "yr", conversionFactor: 31536000 },
            ],
          },
        ];

        setCategories(mockCategories);
        setLoading(false);
      } catch (err) {
        setError("Failed to fetch categories");
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  const getCategoryById = (id: string): Category | undefined => {
    return categories.find(category => category.id === id);
  };

  const getUnitsByCategory = (categoryId: string): Category | undefined => {
    return categories.find(category => category.id === categoryId);
  };

  return {
    categories,
    loading,
    error,
    getCategoryById,
    getUnitsByCategory
  };
}

// EOF