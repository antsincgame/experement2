import { Project, Node, SyntaxKind, type SourceFile } from "ts-morph";
import path from "path";
import fs from "fs";

// ── JSON Export Contracts ──

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
export const extractExportContracts = (filePath: string): ExportContract[] | null => {
  if (!fs.existsSync(filePath)) return null;

  try {
    const project = new Project({ compilerOptions: { strict: true, skipLibCheck: true } });
    const sf = project.addSourceFileAtPath(filePath);
    const contracts: ExportContract[] = [];

    for (const [name, declarations] of sf.getExportedDeclarations()) {
      const decl = declarations[0];
      if (!decl) continue;

      const isDefault = name === "default";
      const actualName = Node.hasName(decl) ? (decl as { getName(): string }).getName() : (isDefault ? "defaultExport" : name);

      let kind: ExportContract["kind"] = "constant";
      let returnTypeStr = "";
      let returnObjectKeys: string[] = [];
      let propsInterface: string | null = null;
      let params: ExportContractParam[] = [];

      if (Node.isFunctionDeclaration(decl) || Node.isVariableDeclaration(decl)) {
        const funcNode = Node.isVariableDeclaration(decl)
          ? decl.getInitializerIfKind(SyntaxKind.ArrowFunction)
          : decl;

        if (funcNode && (Node.isFunctionDeclaration(funcNode) || Node.isArrowFunction(funcNode))) {
          const returnType = funcNode.getReturnType();
          returnTypeStr = returnType.getText(funcNode).slice(0, 300);

          // Determine kind
          if (actualName.startsWith("use")) {
            kind = "hook";
          } else if (/^[A-Z]/.test(actualName) && (returnTypeStr.includes("JSX") || returnTypeStr.includes("ReactNode") || returnTypeStr.includes("Element"))) {
            kind = "component";
          } else {
            kind = "function";
          }

          // Extract params
          params = funcNode.getParameters().map((p) => ({
            name: p.getName(),
            type: p.getType().getText(funcNode).slice(0, 100),
          }));

          // Extract return object keys (for hooks returning objects)
          const baseType = returnType.isPromise() ? (returnType.getTypeArguments()[0] ?? returnType) : returnType;
          if (baseType.isObject() && !baseType.isArray() && !returnTypeStr.includes("Element")) {
            returnObjectKeys = baseType.getProperties().map((p) => p.getName());
          }
        }
      } else if (Node.isInterfaceDeclaration(decl)) {
        kind = "interface";
        const members = decl.getProperties().map((p) => `${p.getName()}: ${p.getType().getText(p)}`).join("; ");
        returnTypeStr = `{ ${members} }`;
      } else if (Node.isTypeAliasDeclaration(decl)) {
        kind = "type";
        returnTypeStr = decl.getType().getText(decl).slice(0, 300);
      }

      // Find Props interface for components
      if (kind === "component") {
        const propsInt = sf.getInterfaces().find((i) =>
          i.getName().endsWith("Props")
        );
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
  } catch {
    return null;
  }
};

// ── Skeleton Types ──

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

const extractExports = (sourceFile: SourceFile): string[] => {
  const exports: string[] = [];

  for (const [name] of sourceFile.getExportedDeclarations()) {
    exports.push(name);
  }

  if (sourceFile.getDefaultExportSymbol()) {
    exports.push("default");
  }

  return [...new Set(exports)];
};

const extractImports = (sourceFile: SourceFile): string[] =>
  sourceFile
    .getImportDeclarations()
    .map((imp) => imp.getModuleSpecifierValue())
    .filter((mod) => mod.startsWith(".") || mod.startsWith("@/"));

const extractTypes = (sourceFile: SourceFile): string[] => {
  const types: string[] = [];

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

const extractComponentProps = (sourceFile: SourceFile): Record<string, string> => {
  const props: Record<string, string> = {};

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

const isProjectFile = (filePath: string): boolean =>
  !filePath.includes("node_modules") &&
  !filePath.includes(".expo") &&
  !filePath.includes("dist") &&
  (filePath.endsWith(".ts") || filePath.endsWith(".tsx"));

export const buildProjectSkeleton = (projectPath: string): ProjectSkeleton => {
  const tsconfigPath = path.join(projectPath, "tsconfig.json");

  if (!fs.existsSync(tsconfigPath)) {
    return { entries: [], summary: "No tsconfig.json found" };
  }

  let project: Project;
  try {
    project = new Project({
      tsConfigFilePath: tsconfigPath,
      skipAddingFilesFromTsConfig: true,
    });
  } catch {
    return { entries: [], summary: "Failed to parse tsconfig.json" };
  }

  const globPatterns = ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}"];
  for (const pattern of globPatterns) {
    project.addSourceFilesAtPaths(path.join(projectPath, pattern));
  }

  const sourceFiles = project.getSourceFiles().filter((sf) =>
    isProjectFile(sf.getFilePath())
  );

  const entries: SkeletonEntry[] = sourceFiles.map((sf) => {
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

const formatSkeleton = (entries: SkeletonEntry[]): string => {
  if (entries.length === 0) return "Empty project";

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
