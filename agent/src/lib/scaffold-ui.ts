// Source files scaffolded into every generated project to give the LLM a small,
// stable, type-forgiving UI surface. Importing everything from "@/ui" means the
// model targets one well-known module instead of the full Tamagui + vector-icons
// API, which removes whole classes of import-path / wrong-member / icon-union
// errors before the compiler loop even runs.

/** Safe icon wrapper: isolates the strict @expo/vector-icons glyph union here. */
const ICON_TSX = `import React from "react";
import Feather from "@expo/vector-icons/Feather";

export interface IconProps {
  /**
   * Any descriptive icon name. Typed as a plain string on purpose so screens can
   * pass names like "calculator" or "pill" without triggering TS2322. Unknown
   * names fall back to a neutral glyph at runtime.
   */
  name: string;
  size?: number;
  color?: string;
  style?: React.ComponentProps<typeof Feather>["style"];
}

const FALLBACK_ICON = "circle";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

export default function Icon({ name, size = 24, color = "#111827", style }: IconProps) {
  const glyphMap =
    (Feather as unknown as { glyphMap?: Record<string, number> }).glyphMap ?? {};
  const resolved = Object.prototype.hasOwnProperty.call(glyphMap, name)
    ? name
    : FALLBACK_ICON;
  return <Feather name={resolved as FeatherName} size={size} color={color} style={style} />;
}
`;

/**
 * Safe slider wrapper: normalizes the two APIs models routinely confuse — Tamagui's
 * compound min/max/value[] Slider and @react-native-community/slider's
 * minValue/maxValue/tint props — onto Tamagui, rendering the required Track/Thumb
 * internally. Prevents whole classes of TS2322 build failures from either API.
 */
const SLIDER_TSX = `import React from "react";
import { Slider as TamaguiSlider } from "tamagui";

type TamaguiSliderProps = React.ComponentProps<typeof TamaguiSlider>;
type SliderValue = number | number[];

export interface SliderProps {
  value?: SliderValue;
  defaultValue?: SliderValue;
  min?: number;
  max?: number;
  /** Alias accepted for @react-native-community/slider compatibility. */
  minValue?: number;
  /** Alias accepted for @react-native-community/slider compatibility. */
  maxValue?: number;
  step?: number;
  size?: TamaguiSliderProps["size"];
  width?: TamaguiSliderProps["width"];
  disabled?: boolean;
  onValueChange?: (value: number[]) => void;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
  /** Accepted for compatibility; layout is driven by width/flex instead. */
  style?: unknown;
}

const toArray = (value: SliderValue | undefined): number[] | undefined =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

export function Slider({
  value,
  defaultValue,
  min,
  max,
  minValue,
  maxValue,
  step = 1,
  size = "$4",
  width,
  disabled,
  onValueChange,
  minimumTrackTintColor,
  maximumTrackTintColor,
  thumbTintColor,
}: SliderProps) {
  const lowerBound = min ?? minValue ?? 0;
  const controlled = toArray(value);
  const uncontrolled = toArray(defaultValue) ?? [lowerBound];
  const valueProps = controlled
    ? { value: controlled }
    : { defaultValue: uncontrolled };

  return (
    <TamaguiSlider
      min={lowerBound}
      max={max ?? maxValue ?? 100}
      step={step}
      size={size}
      disabled={disabled}
      onValueChange={onValueChange}
      {...(width === undefined ? { flex: 1 } : { width })}
      {...valueProps}
    >
      <TamaguiSlider.Track backgroundColor={maximumTrackTintColor}>
        <TamaguiSlider.TrackActive backgroundColor={minimumTrackTintColor} />
      </TamaguiSlider.Track>
      <TamaguiSlider.Thumb index={0} circular backgroundColor={thumbTintColor} />
    </TamaguiSlider>
  );
}
`;

/** Barrel: the blessed, version-locked component surface for generated apps. */
const UI_INDEX_TS = `// The complete UI surface available to this app. Import from "@/ui" only.
// Layout/typography/controls are Tamagui primitives; <Icon>/<Slider> are safe wrappers.
export {
  YStack,
  YStack as Box,
  XStack,
  XStack as Row,
  Text,
  Paragraph,
  SizableText,
  H1,
  H2,
  H3,
  H4,
  Button,
  Input,
  TextArea,
  ScrollView,
  Separator,
  Spinner,
  Switch,
  Card,
  Image,
  Sheet,
  Dialog,
  Theme,
} from "tamagui";

export { Slider } from "./Slider";
export type { SliderProps } from "./Slider";
export { default as Icon } from "./Icon";
export type { IconProps } from "./Icon";
`;

export const SCAFFOLD_UI_FILES: Record<string, string> = {
  "src/ui/Icon.tsx": ICON_TSX,
  "src/ui/Slider.tsx": SLIDER_TSX,
  "src/ui/index.ts": UI_INDEX_TS,
};
