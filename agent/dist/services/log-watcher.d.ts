import type { ChildProcess } from "child_process";
export type BuildStatus = "building" | "success" | "error" | "idle";
export type BuildIssueCategory = "dependency" | "syntax" | "runtime" | "bundle" | "unknown";
export interface ParsedError {
    type: string;
    category: BuildIssueCategory;
    file: string;
    line: string;
    stack: string;
    raw: string;
}
export declare const parseMetroError: (output: string) => ParsedError | null;
export type LogCallback = (event: {
    type: "build_log" | "build_error" | "build_success";
    message?: string;
    error?: string;
}) => void;
export declare const watchProcess: (childProcess: ChildProcess, callback: LogCallback) => (() => void);
//# sourceMappingURL=log-watcher.d.ts.map