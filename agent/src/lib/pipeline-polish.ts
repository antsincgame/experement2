// Opt-in design polish stage — isolated from main orchestrator to avoid import cycles.
import { readFile as readProjectFile, writeFile as writeProjectFile } from "../services/file-manager.js";
import { collectStream } from "./stream-collect.js";
import { stripCodePreamble } from "./generator.js";
import { runDesignPolish } from "./design-polish.js";
import { KNOWLEDGE_BASE } from "../prompts/knowledge-base.js";
import type { PipelineContext } from "./pipeline-types.js";
import { warnCaught } from "./catch-log.js";

const selectPolishScreens = (files: string[]): string[] =>
  files.filter(
    (fp) =>
      /^app\//.test(fp) &&
      fp.endsWith(".tsx") &&
      !fp.endsWith(".test.tsx") &&
      !fp.endsWith(".spec.tsx"),
  );

export const runPolishStage = async (
  projectSlug: string,
  projectPath: string,
  files: string[],
  maxPasses: number,
  options: { lmStudioUrl?: string; model?: string; maxTokens?: number },
  ctx: PipelineContext,
  emitOperation: (message: Record<string, unknown>) => void,
): Promise<void> => {
  const screens = selectPolishScreens(files);
  if (screens.length === 0) return;

  const { complete, runTypecheck } = ctx;

  await runDesignPolish(screens, maxPasses, {
    critique: async ({ path, content }) => {
      const messages = [
        {
          role: "system" as const,
          content: `You improve the VISUAL DESIGN of ONE React Native (Expo + Tamagui) screen.
Apply this design system where it helps:
${KNOWLEDGE_BASE.designSystem}

RULES:
- Change ONLY styling/layout/visual structure. NEVER change behavior, data flow, props, exports, imports of logic, or navigation.
- Keep every existing export and component name unchanged.
- UI primitives and icons come from "@/ui" (e.g. import { Box, Row, Text, Button, Input, Icon } from "@/ui"); <Icon name="..."> accepts ANY string.
- Output ONLY the complete improved file as raw TSX. NO markdown fences. NO explanations. NO preamble. NO // EOF.
- If the screen is already well-designed, return the EXACT same code unchanged.`,
        },
        { role: "user" as const, content: `File: ${path}\n\nCurrent file content:\n${content}` },
      ];

      const stream = await complete(messages, {
        temperature: 0.3,
        maxTokens: options.maxTokens ?? 65536,
        lmStudioUrl: options.lmStudioUrl,
        model: options.model,
      });
      const raw = await collectStream(stream);
      const cleaned = stripCodePreamble(raw).replace(/\s*\/\/\s*EOF\s*$/, "").trim();
      if (cleaned.length < 20 || cleaned === content.trim()) return null;
      return cleaned;
    },
    validate: async () => {
      try {
        return (await runTypecheck(projectPath)).success;
      } catch (error) {
        warnCaught("pipeline-polish", error, "polish validation typecheck failed");
        return false;
      }
    },
    writeFile: (path, content) => writeProjectFile(projectSlug, path, content),
    readFile: (path) => readProjectFile(projectSlug, path),
    emit: (pass, maxPassesEmitted, message) =>
      emitOperation({ type: "polish_progress", pass, maxPasses: maxPassesEmitted, message }),
  });
};
