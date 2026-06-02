import { describe, it, expect } from "vitest";
import { SCAFFOLD_DB_FILES } from "./scaffold-db.js";
import { DATA_KIT, PATH_ALIAS } from "./generation-contract.js";

describe("SCAFFOLD_DB_FILES", () => {
  const dbPath = "src/services/db.ts";
  const db = SCAFFOLD_DB_FILES[dbPath];

  it("scaffolds the data layer at the path implied by DATA_KIT.importPath", () => {
    const resolved = DATA_KIT.importPath
      .replace(PATH_ALIAS.importPrefix, PATH_ALIAS.sourcePrefix)
      .concat(".ts");
    expect(resolved).toBe(dbPath);
    expect(db).toBeTypeOf("string");
    expect(db.length).toBeGreaterThan(0);
  });

  it("exports the blessed persistence surface (createCollection + kv)", () => {
    expect(db).toContain(`export function ${DATA_KIT.createCollection}`);
    expect(db).toContain(`export const ${DATA_KIT.keyValue} =`);
    expect(db).toContain("export interface Collection<T extends Identifiable>");
  });

  it("is backed by AsyncStorage so persistence works on web preview + native", () => {
    expect(db).toContain(
      'import AsyncStorage from "@react-native-async-storage/async-storage"'
    );
    expect(db).not.toContain("expo-sqlite");
  });

  it("keeps the surface strictly typed (no `any`) and Promise-based", () => {
    expect(db).not.toMatch(/\bany\b/);
    expect(db).toContain("Promise<T[]>");
  });
});
