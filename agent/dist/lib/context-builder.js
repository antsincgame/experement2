// Fixes contract extraction typing so ts-morph analysis stays compatible with strict builds.
import { Project, Node, SyntaxKind } from "ts-morph";
import path from "path";
import fs from "fs";
const unwrapPromiseType = (returnType, sourceNode) => {
    const returnTypeText = returnType.getText(sourceNode);
    if (!returnTypeText.startsWith("Promise<")) {
        return returnType;
    }
    return returnType.getTypeArguments()[0] ?? returnType;
};
/** Extract structured JSON export contracts from a generated file using ts-morph */
export const extractExportContracts = (filePath) => {
    if (!fs.existsSync(filePath))
        return null;
    try {
        const project = new Project({ compilerOptions: { strict: true, skipLibCheck: true } });
        const sf = project.addSourceFileAtPath(filePath);
        const contracts = [];
        for (const [name, declarations] of sf.getExportedDeclarations()) {
            const decl = declarations[0];
            if (!decl)
                continue;
            const isDefault = name === "default";
            const actualName = Node.hasName(decl) ? decl.getName() : (isDefault ? "defaultExport" : name);
            let kind = "constant";
            let returnTypeStr = "";
            let returnObjectKeys = [];
            let propsInterface = null;
            let params = [];
            if (Node.isFunctionDeclaration(decl) || Node.isVariableDeclaration(decl)) {
                const funcNode = Node.isVariableDeclaration(decl)
                    ? decl.getInitializerIfKind(SyntaxKind.ArrowFunction)
                    : decl;
                if (funcNode && (Node.isFunctionDeclaration(funcNode) || Node.isArrowFunction(funcNode))) {
                    const returnType = funcNode.getReturnType();
                    returnTypeStr = returnType.getText(funcNode).slice(0, 300);
                    if (actualName.startsWith("use")) {
                        kind = "hook";
                    }
                    else if (/^[A-Z]/.test(actualName) && (returnTypeStr.includes("JSX") || returnTypeStr.includes("ReactNode") || returnTypeStr.includes("Element"))) {
                        kind = "component";
                    }
                    else {
                        kind = "function";
                    }
                    params = funcNode.getParameters().map((p) => ({
                        name: p.getName(),
                        type: p.getType().getText(funcNode).slice(0, 100),
                    }));
                    const baseType = unwrapPromiseType(returnType, funcNode);
                    if (baseType.isObject() && !baseType.isArray() && !returnTypeStr.includes("Element")) {
                        returnObjectKeys = baseType.getProperties().map((p) => p.getName());
                    }
                }
                else if (Node.isVariableDeclaration(decl) && actualName.startsWith("use")) {
                    // Zustand store: const useStore = create<StoreInterface>((set) => ({...}))
                    // Extract keys from the store's return type (the hook's call signature)
                    kind = "hook";
                    const declType = decl.getType();
                    const callSigs = declType.getCallSignatures();
                    if (callSigs.length > 0) {
                        const returnType = callSigs[0].getReturnType();
                        returnTypeStr = returnType.getText().slice(0, 300);
                        if (returnType.isObject() && !returnType.isArray()) {
                            returnObjectKeys = returnType.getProperties().map((p) => p.getName());
                        }
                    }
                    // Fallback: scan file for store interface
                    if (returnObjectKeys.length === 0) {
                        const storeName = actualName.replace(/^use/, "").replace(/Store$/, "");
                        const interfaces = sf.getInterfaces();
                        // Priority 1: interface matching store name
                        let matched = interfaces.find((i) => {
                            const n = i.getName();
                            return n.includes(storeName) || n.includes("Store") || n.includes("State");
                        });
                        // Priority 2: any interface with 3+ properties (likely the store shape)
                        if (!matched) {
                            matched = interfaces.find((i) => i.getProperties().length >= 3);
                        }
                        if (matched) {
                            returnObjectKeys = matched.getProperties().map((p) => p.getName());
                            returnTypeStr = `{ ${returnObjectKeys.join("; ")} }`;
                        }
                    }
                    // Fallback 2: parse store interface from raw source via regex
                    if (returnObjectKeys.length === 0) {
                        const src = sf.getFullText();
                        const ifaceMatch = src.match(/interface\s+\w+\s*\{([^}]+)\}/);
                        if (ifaceMatch) {
                            const body = ifaceMatch[1];
                            returnObjectKeys = body
                                .split(/[;\n]/)
                                .map((line) => line.trim().split(/[:(]/)[0].trim())
                                .filter((k) => k.length > 0 && !k.startsWith("//"));
                        }
                    }
                }
            }
            else if (Node.isInterfaceDeclaration(decl)) {
                kind = "interface";
                const members = decl.getProperties().map((p) => `${p.getName()}: ${p.getType().getText(p)}`).join("; ");
                returnTypeStr = `{ ${members} }`;
            }
            else if (Node.isTypeAliasDeclaration(decl)) {
                kind = "type";
                returnTypeStr = decl.getType().getText(decl).slice(0, 300);
            }
            // Find Props interface for components
            if (kind === "component") {
                const propsInt = sf.getInterfaces().find((i) => i.getName().endsWith("Props"));
                if (propsInt) {
                    const members = propsInt.getProperties().map((p) => `${p.getName()}: ${p.getType().getText(p)}`).join("; ");
                    propsInterface = `{ ${members} }`;
                }
            }
            contracts.push({
                name: actualName,
                isDefaultExport: isDefault,
                kind,
                params,
                returnType: returnTypeStr,
                returnObjectKeys,
                propsInterface,
            });
        }
        return contracts.length > 0 ? contracts : null;
    }
    catch {
        return null;
    }
};
const extractExports = (sourceFile) => {
    const exports = [];
    for (const [name] of sourceFile.getExportedDeclarations()) {
        exports.push(name);
    }
    if (sourceFile.getDefaultExportSymbol()) {
        exports.push("default");
    }
    return [...new Set(exports)];
};
const extractImports = (sourceFile) => sourceFile
    .getImportDeclarations()
    .map((imp) => imp.getModuleSpecifierValue())
    .filter((mod) => mod.startsWith(".") || mod.startsWith("@/"));
const extractTypes = (sourceFile) => {
    const types = [];
    for (const iface of sourceFile.getInterfaces()) {
        const props = iface
            .getProperties()
            .map((p) => `${p.getName()}: ${p.getType().getText(p)}`)
            .join("; ");
        types.push(`interface ${iface.getName()} { ${props} }`);
    }
    for (const typeAlias of sourceFile.getTypeAliases()) {
        types.push(`type ${typeAlias.getName()} = ${typeAlias.getType().getText(typeAlias)}`);
    }
    return types;
};
const extractComponentProps = (sourceFile) => {
    const props = {};
    for (const iface of sourceFile.getInterfaces()) {
        const name = iface.getName();
        if (name.endsWith("Props")) {
            const members = iface
                .getProperties()
                .map((p) => `${p.getName()}: ${p.getType().getText(p)}`)
                .join("; ");
            props[name] = members;
        }
    }
    return props;
};
const isProjectFile = (filePath) => !filePath.includes("node_modules") &&
    !filePath.includes(".expo") &&
    !filePath.includes("dist") &&
    (filePath.endsWith(".ts") || filePath.endsWith(".tsx"));
export const buildProjectSkeleton = (projectPath) => {
    const tsconfigPath = path.join(projectPath, "tsconfig.json");
    if (!fs.existsSync(tsconfigPath)) {
        return { entries: [], summary: "No tsconfig.json found" };
    }
    let project;
    try {
        project = new Project({
            tsConfigFilePath: tsconfigPath,
            skipAddingFilesFromTsConfig: true,
        });
    }
    catch {
        return { entries: [], summary: "Failed to parse tsconfig.json" };
    }
    const globPatterns = ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}"];
    for (const pattern of globPatterns) {
        project.addSourceFilesAtPaths(path.join(projectPath, pattern));
    }
    const sourceFiles = project.getSourceFiles().filter((sf) => isProjectFile(sf.getFilePath()));
    const entries = sourceFiles.map((sf) => {
        const relativePath = path
            .relative(projectPath, sf.getFilePath())
            .replace(/\\/g, "/");
        return {
            path: relativePath,
            exports: extractExports(sf),
            imports: extractImports(sf),
            types: extractTypes(sf),
            props: extractComponentProps(sf),
        };
    });
    const summary = formatSkeleton(entries);
    return { entries, summary };
};
const formatSkeleton = (entries) => {
    if (entries.length === 0)
        return "Empty project";
    return entries
        .map((entry) => {
        const parts = [`// ${entry.path}`];
        if (entry.exports.length > 0) {
            parts.push(`  exports: [${entry.exports.join(", ")}]`);
        }
        if (entry.imports.length > 0) {
            parts.push(`  imports: [${entry.imports.join(", ")}]`);
        }
        if (entry.types.length > 0) {
            parts.push(`  ${entry.types.join("\n  ")}`);
        }
        const propsEntries = Object.entries(entry.props);
        if (propsEntries.length > 0) {
            for (const [name, members] of propsEntries) {
                parts.push(`  ${name} { ${members} }`);
            }
        }
        return parts.join("\n");
    })
        .join("\n\n");
};
//# sourceMappingURL=context-builder.js.map