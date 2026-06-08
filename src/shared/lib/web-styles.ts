import { type ViewStyle } from "react-native";

/**
 * Type-safe cast for inline styles mixing RN + web CSS.
 * Use instead of `as never` when spreading web-only props into style={{}}.
 */
export const mixedStyle = (style: Record<string, unknown>): ViewStyle =>
  style as unknown as ViewStyle;
