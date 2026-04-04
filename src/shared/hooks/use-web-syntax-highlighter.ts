// Loads the web-only syntax highlighter lazily so native builds stay clean and lint-safe.
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

type PrismHighlighter = typeof import("react-syntax-highlighter").Prism;

interface SyntaxHighlighterState {
  SyntaxHighlighter: PrismHighlighter | null;
  theme: Record<string, CSSProperties> | null;
}

export type SyntaxThemeName = "oneDark" | "vscDarkPlus";

export const useWebSyntaxHighlighter = (
  themeName: SyntaxThemeName
): SyntaxHighlighterState => {
  const [state, setState] = useState<SyntaxHighlighterState>({
    SyntaxHighlighter: null,
    theme: null,
  });

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }

    let isActive = true;

    const loadSyntaxHighlighter = async (): Promise<void> => {
      try {
        const [{ Prism }, prismThemes] = await Promise.all([
          import("react-syntax-highlighter"),
          import("react-syntax-highlighter/dist/esm/styles/prism"),
        ]);

        if (!isActive) {
          return;
        }

        setState({
          SyntaxHighlighter: Prism,
          theme: prismThemes[themeName] as Record<string, CSSProperties>,
        });
      } catch {
        if (!isActive) {
          return;
        }

        setState({
          SyntaxHighlighter: null,
          theme: null,
        });
      }
    };

    void loadSyntaxHighlighter();

    return () => {
      isActive = false;
    };
  }, [themeName]);

  return state;
};
