/**
 * Filters extraDependencies: removes already-bundled deps, validates against
 * safe-list and npm registry. Returns only installable packages.
 */
export declare const validateDependencies: (deps: string[]) => Promise<{
    valid: string[];
    rejected: string[];
}>;
//# sourceMappingURL=dependency-validator.d.ts.map