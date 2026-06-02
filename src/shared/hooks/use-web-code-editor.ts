// Lazy-loads CodeMirror on web only so native bundles stay free of editor dependencies.
import type { Extension } from "@codemirror/state";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

type CodeMirrorComponent = ComponentType<{
  value: string;
  height?: string;
  minHeight?: string;
  theme?: Extension;
  extensions?: Extension[];
  onChange?: (value: string) => void;
  basicSetup?: boolean | Record<string, unknown>;
  editable?: boolean;
  readOnly?: boolean;
}>;

export type EditorLanguage =
  | "javascript"
  | "typescript"
  | "jsx"
  | "tsx"
  | "json"
  | "css"
  | "markdown";

export interface WebCodeEditorState {
  CodeMirror: CodeMirrorComponent | null;
  theme: Extension | null;
  languageExtension: Extension | null;
}

export const editorLanguageFromPath = (filepath: string): EditorLanguage => {
  const ext = filepath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, EditorLanguage> = {
    tsx: "tsx",
    ts: "typescript",
    jsx: "jsx",
    js: "javascript",
    json: "json",
    css: "css",
    md: "markdown",
  };
  return map[ext] ?? "javascript";
};

const loadLanguageExtension = async (language: EditorLanguage): Promise<Extension> => {
  if (language === "json") {
    const { json } = await import("@codemirror/lang-json");
    return json();
  }
  if (language === "css") {
    const { css } = await import("@codemirror/lang-css");
    return css();
  }
  const { javascript } = await import("@codemirror/lang-javascript");
  return javascript({
    typescript: language === "typescript" || language === "tsx",
    jsx: language === "jsx" || language === "tsx",
  });
};

export const useWebCodeEditor = (filepath: string | null): WebCodeEditorState => {
  const [state, setState] = useState<WebCodeEditorState>({
    CodeMirror: null,
    theme: null,
    languageExtension: null,
  });

  useEffect(() => {
    if (Platform.OS !== "web" || !filepath) {
      setState({ CodeMirror: null, theme: null, languageExtension: null });
      return;
    }

    let isActive = true;
    const language = editorLanguageFromPath(filepath);

    const loadEditor = async (): Promise<void> => {
      try {
        const [codemirrorMod, themeMod, languageExtension] = await Promise.all([
          import("@uiw/react-codemirror"),
          import("@codemirror/theme-one-dark"),
          loadLanguageExtension(language),
        ]);

        if (!isActive) {
          return;
        }

        setState({
          CodeMirror: codemirrorMod.default as CodeMirrorComponent,
          theme: themeMod.oneDark,
          languageExtension,
        });
      } catch {
        if (!isActive) {
          return;
        }
        setState({ CodeMirror: null, theme: null, languageExtension: null });
      }
    };

    void loadEditor();

    return () => {
      isActive = false;
    };
  }, [filepath]);

  return state;
};
