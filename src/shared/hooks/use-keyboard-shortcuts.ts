import { useEffect } from "react";
import { Platform } from "react-native";
import { useProjectStore } from "@/stores/project-store";

export const useKeyboardShortcuts = () => {
  const toggleFileTree = useProjectStore((s) => s.toggleFileTree);
  const toggleTerminal = useProjectStore((s) => s.toggleTerminal);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === "b") {
        e.preventDefault();
        toggleFileTree();
      }

      if (e.key === "j") {
        e.preventDefault();
        toggleTerminal();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleFileTree, toggleTerminal]);
};
