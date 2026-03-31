export declare const safeResolveUnderRoot: (...segments: string[]) => string;
export declare const writeFile: (projectName: string, filePath: string, content: string) => void;
export declare const readFile: (projectName: string, filePath: string) => string | null;
export declare const deleteFile: (projectName: string, filePath: string) => boolean;
export declare const fileExists: (projectName: string, filePath: string) => boolean;
export interface FileTreeNode {
    name: string;
    path: string;
    type: "file" | "directory";
    children?: FileTreeNode[];
}
export declare const getFileTree: (projectName: string) => FileTreeNode[];
export declare const listAllFiles: (projectName: string) => string[];
export declare const getProjectPath: (projectName: string) => string;
export declare const getWorkspaceRoot: () => string;
export declare const projectExists: (projectName: string) => boolean;
export declare const copyDirectory: (src: string, dest: string) => void;
//# sourceMappingURL=file-manager.d.ts.map