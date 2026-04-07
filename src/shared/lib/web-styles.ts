import { Platform, type ViewStyle, type TextStyle } from "react-native";

type WebCSSProps = {
  backdropFilter?: string;
  WebkitBackdropFilter?: string;
  background?: string;
  boxShadow?: string;
  transition?: string;
  outlineStyle?: string;
  userSelect?: string;
};

type MixedStyle = ViewStyle & WebCSSProps;
type MixedTextStyle = TextStyle & WebCSSProps;

/** Merges React Native styles with web-only CSS properties. Strips web props on native. */
export const webStyle = (base: ViewStyle, webProps?: WebCSSProps): MixedStyle => {
  if (Platform.OS !== "web" || !webProps) return base as MixedStyle;
  return { ...base, ...webProps } as MixedStyle;
};

/** Same for text styles */
export const webTextStyle = (base: TextStyle, webProps?: WebCSSProps): MixedTextStyle => {
  if (Platform.OS !== "web" || !webProps) return base as MixedTextStyle;
  return { ...base, ...webProps } as MixedTextStyle;
};

/**
 * Type-safe cast for inline styles mixing RN + web CSS.
 * Use instead of `as never` when spreading web-only props into style={{}}.
 */
export const mixedStyle = (style: Record<string, unknown>): ViewStyle =>
  style as unknown as ViewStyle;
