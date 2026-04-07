export interface ExportContractParam {
    name: string;
    type: string;
}
export interface ExportContract {
    name: string;
    isDefaultExport: boolean;
    kind: "function" | "component" | "hook" | "constant" | "type" | "interface";
    params: ExportContractParam[];
    returnType: string;
    returnObjectKeys: string[];
    propsInterface: string | null;
}
/** Extract structured JSON export contracts from a generated file using ts-morph */
export declare const extractExportContracts: (filePath: string) => ExportContract[] | null;
export interface SkeletonEntry {
    path: string;
    exports: string[];
    imports: string[];
    types: string[];
    props: Record<string, string>;
}
export interface ProjectSkeleton {
    entries: SkeletonEntry[];
    summary: string;
}
export declare const buildProjectSkeleton: (projectPath: string) => ProjectSkeleton;
//# sourceMappingURL=context-builder.d.ts.map