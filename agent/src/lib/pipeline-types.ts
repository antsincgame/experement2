// Shared pipeline types and default runtime context (no orchestration logic).
import { broadcast, setPreviewPort } from "./event-bus.js";
import { createProjectFromCache } from "../services/template-cache.js";
import {
  startExpo,
  startExpoClearCache,
  killExpo,
  getActivePort,
  runTypecheck,
  runWebExport,
  runNativeSmoke,
  npmInstall,
} from "../services/process-manager.js";
import { runGitCommand } from "./git.js";
import { streamCompletion, type CompleteFn } from "../services/llm-proxy.js";

export interface GateResult {
  success: boolean;
  errors: string[];
}

export interface PipelineContext {
  complete: CompleteFn;
  createProjectFromCache: typeof createProjectFromCache;
  startExpo: typeof startExpo;
  startExpoClearCache: typeof startExpoClearCache;
  killExpo: typeof killExpo;
  getActivePort: typeof getActivePort;
  runTypecheck: typeof runTypecheck;
  runWebExport: typeof runWebExport;
  runNativeSmoke: typeof runNativeSmoke;
  npmInstall: typeof npmInstall;
  runGitCommand: typeof runGitCommand;
  broadcast: typeof broadcast;
  setPreviewPort: typeof setPreviewPort;
  fetch: typeof fetch;
}

export const createDefaultContext = (): PipelineContext => ({
  complete: streamCompletion,
  createProjectFromCache,
  startExpo,
  startExpoClearCache,
  killExpo,
  getActivePort,
  runTypecheck,
  runWebExport,
  runNativeSmoke,
  npmInstall,
  runGitCommand,
  broadcast,
  setPreviewPort,
  fetch: globalThis.fetch.bind(globalThis),
});
