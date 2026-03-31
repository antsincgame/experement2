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