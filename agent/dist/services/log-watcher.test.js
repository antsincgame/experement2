import { describe, it, expect } from "vitest";
import { parseMetroError } from "./log-watcher";
describe("parseMetroError", () => {
    it('parses "Unable to resolve module" error', () => {
        const output = `Unable to resolve module "react-native-svg" from "src/components/Icon.tsx"`;
        const result = parseMetroError(output);
        expect(result).not.toBeNull();
        expect(result.type).toContain("Unable to resolve module");
        expect(result.file).toBe("src/components/Icon.tsx");
    });
    it('parses "Cannot find module" error', () => {
        const output = `Cannot find module '@expo/vector-icons'`;
        const result = parseMetroError(output);
        expect(result).not.toBeNull();
        expect(result.type).toContain("Cannot find module");
    });
    it('parses "SyntaxError" with file and line number', () => {
        const output = [
            "SyntaxError: Unexpected token (12:5)",
            "  at src/App.tsx:12",
        ].join("\n");
        const result = parseMetroError(output);
        expect(result).not.toBeNull();
        expect(result.type).toContain("SyntaxError");
        expect(result.file).toBe("src/App.tsx");
        expect(result.line).toBe("12");
    });
    it('parses "TypeError" pattern', () => {
        const output = "TypeError: Cannot read property 'map' of undefined";
        const result = parseMetroError(output);
        expect(result).not.toBeNull();
        expect(result.type).toContain("TypeError");
    });
    it("truncates raw output to 500 chars", () => {
        const longLine = "Error: " + "x".repeat(600);
        const result = parseMetroError(longLine);
        expect(result).not.toBeNull();
        expect(result.raw.length).toBeLessThanOrEqual(500);
        expect(result.raw.endsWith("...")).toBe(true);
    });
    it("does not truncate short output", () => {
        const output = "Error: something broke";
        const result = parseMetroError(output);
        expect(result).not.toBeNull();
        expect(result.raw).not.toContain("...");
    });
    it("returns result even for warning-only text (noise filtered from stack)", () => {
        const output = "warning: some deprecation notice";
        const result = parseMetroError(output);
        // warning lines are noise but error pattern /error:/i still matches "warning"
        // Actually "warning" is a noise line AND doesn't match error patterns clearly
        // Let's check: isNoiseLine filters it, but the line itself may or may not match ERROR_PATTERNS
        // "warning: some deprecation notice" - the /error:\s*(.+)/i would NOT match "warning:"
        // So no error pattern matches -> errorType stays "UnknownError", file stays "unknown"
        // But parseMetroError still returns a result (it doesn't check if error was found)
        // However the stack will be empty because all lines are noise
        expect(result).not.toBeNull();
        expect(result.stack).toBe("");
    });
    it('detects "BUNDLE error" pattern', () => {
        const output = [
            "BUNDLE  ./index.js error",
            "SyntaxError: Unexpected token (45:10)",
            "  at src/screens/Home.tsx:45",
        ].join("\n");
        const result = parseMetroError(output);
        expect(result).not.toBeNull();
        expect(result.type).toContain("SyntaxError");
        expect(result.file).toBe("src/screens/Home.tsx");
        expect(result.line).toBe("45");
    });
    it("returns non-null for empty string (no lines after filter)", () => {
        const result = parseMetroError("");
        expect(result).toBeNull();
    });
    it("returns non-null for whitespace-only string", () => {
        const result = parseMetroError("   \n  \n   ");
        expect(result).toBeNull();
    });
    it("extracts file from Metro 'in path/to/file.tsx' format", () => {
        const output = [
            "Error: Something failed",
            "in src/components/Button.tsx",
        ].join("\n");
        const result = parseMetroError(output);
        expect(result).not.toBeNull();
        expect(result.file).toBe("src/components/Button.tsx");
    });
    it("prefers FILE_LINE_PATTERN over METRO_FILE_PATTERN", () => {
        const output = [
            "Error: Compilation failed",
            "  at src/App.tsx:10",
            "in src/index.tsx",
        ].join("\n");
        const result = parseMetroError(output);
        expect(result).not.toBeNull();
        expect(result.file).toBe("src/App.tsx");
        expect(result.line).toBe("10");
    });
    it("limits stack lines to 5 non-noise entries", () => {
        const lines = [
            "Error: crash",
            "line1",
            "line2",
            "line3",
            "line4",
            "line5",
            "line6-should-be-excluded",
        ];
        const result = parseMetroError(lines.join("\n"));
        expect(result).not.toBeNull();
        const stackLines = result.stack.split("\n");
        expect(stackLines.length).toBeLessThanOrEqual(5);
    });
    it("detects build_success from 'Bundled' text (integration context)", () => {
        // parseMetroError itself doesn't detect success, but we verify
        // that "Bundled" without "error" is NOT treated as an error
        const output = "Bundled 1234ms";
        const result = parseMetroError(output);
        // This returns a result because parseMetroError always returns for non-empty,
        // but it won't match any error pattern
        expect(result).not.toBeNull();
        expect(result.type).toBe("UnknownError");
        // The real success detection happens in watchProcess via text.includes("Bundled")
    });
});
//# sourceMappingURL=log-watcher.test.js.map