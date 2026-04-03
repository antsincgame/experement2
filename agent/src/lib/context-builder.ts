import { Project, type SourceFile } from "ts-morph";
import path from "path";
import fs from "fs";

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

/** Extract function return type and signature from a generated file */
export const extractFileSignature = (filePath: string): string | null => {
  if (!fs.existsSync(filePath)) return null;

  try {
    const project = new Project({ compilerOptions: { strict: true, skipLibCheck: true } });
    const sf = project.addSourceFileAtPath(filePath);

    const parts: string[] = [];

    // Default export function signature
    const defaultExport = sf.getDefaultExportSymbol();
    if (defaultExport) {
      const decl = defaultExport.getValueDeclaration();
      if (decl) {
        const type = decl.getType();
        parts.push(`default export: ${type.getText(decl).slice(0, 200)}`);
      }
    }

    // Named exports
    for (const [name, decls] of sf.getExportedDeclarations()) {
      if (name === "default") continue;
      const decl = decls[0];
      if (decl) {
        const type = decl.getType();
        parts.push(`export ${name}: ${type.getText(decl).slice(0, 200)}`);
      }
    }

    // Interfaces/types
    for (const iface of sf.getInterfaces()) {
      if (iface.isExported()) {
        const members = iface.getProperties()
          .map((p) => `${p.getName()}: ${p.getType().getText(p)}`)
          .join("; ");
        parts.push(`interface ${iface.getName()} { ${members} }`);
      }
    }

    return parts.length > 0 ? parts.join("\n") : null;
  } catch {
    return null;
  }
};

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
