export interface Unit {
  id: string;
  name: string;
  abbreviation: string;
  conversionFactor: number;
}

export interface Category {
  id: string;
  name: string;
  units: Unit[];
}

export interface ConverterState {
  fromUnit: Unit | null;
  toUnit: Unit | null;
  inputValue: string;
  resultValue: string;
  selectedCategory: Category | null;
}

export interface SettingsState {
  theme: 'light' | 'dark';
  isMetric: boolean;
}

// EOF