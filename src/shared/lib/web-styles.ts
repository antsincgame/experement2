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

/** Merges React Native styles with web-only CSS properties. Strips web props on native. */
export const webStyle = (base: ViewStyle, webProps?: WebCSSProps): MixedStyle => {
  if (Platform.OS !== "web" || !webProps) return base as MixedStyle;
  return { ...base, ...webProps } as MixedStyle;
};

/** Same for text styles */
export const webTextStyle = (base: TextStyle, webProps?: WebCSSProps): TextStyle & WebCSSProps => {
  if (Platform.OS !== "web" || !webProps) return base as TextStyle & WebCSSProps;
  return { ...base, ...webProps } as TextStyle & WebCSSProps;
};
