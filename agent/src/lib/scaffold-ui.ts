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

/** Barrel: the blessed, version-locked component surface for generated apps. */
const UI_INDEX_TS = `// The complete UI surface available to this app. Import from "@/ui" only.
// Layout/typography/controls are Tamagui primitives; <Icon> is a safe wrapper.
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
  Slider,
  Card,
  Image,
  Sheet,
  Dialog,
  Theme,
} from "tamagui";

export { default as Icon } from "./Icon";
export type { IconProps } from "./Icon";
`;

export const SCAFFOLD_UI_FILES: Record<string, string> = {
  "src/ui/Icon.tsx": ICON_TSX,
  "src/ui/index.ts": UI_INDEX_TS,
};
