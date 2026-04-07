import { type ChildProcess } from "child_process";
import { type LogCallback } from "./log-watcher.js";
export interface CommandResult {
    success: boolean;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    combinedOutput: string;
}
export declare const startExpo: (projectName: string, projectPath: string, onLog: LogCallback, clearCache?: boolean) => Promise<{
    port: number;
    process: ChildProcess;
}>;
export declare const startExpoClearCache: (projectName: string, projectPath: string, port: number, onLog: LogCallback) => Promise<{
    port: number;
    process: ChildProcess;
}>;
export declare const killExpo: (projectName: string) => void;
export declare const npmInstall: (projectPath: string, packages?: string[]) => Promise<void>;
export declare const runProjectCommand: (projectPath: string, command: string, args: string[], timeoutMs?: number) => Promise<CommandResult>;
export declare const runTypecheck: (projectPath: string) => Promise<CommandResult>;
export declare const runWebExport: (projectPath: string) => Promise<CommandResult>;
export declare const runNativeSmoke: (projectPath: string, platform: "android" | "ios") => Promise<CommandResult>;
export declare const getActivePort: (projectName: string) => number | null;
export declare const isRunning: (projectName: string) => boolean;
export declare const killAll: () => void;
//# sourceMappingURL=process-manager.d.ts.map