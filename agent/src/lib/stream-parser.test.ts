import { parseStream } from "./stream-parser.js";
import type { SearchReplaceBlock } from "../schemas/search-replace.schema.js";

type ParserYield = SearchReplaceBlock | { type: "thinking"; content: string };

async function* toStream(
  text: string,
  chunkSize = 50
): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += chunkSize) {
    yield text.slice(i, i + chunkSize);
  }
}

async function* toLineStream(lines: string[]): AsyncGenerator<string> {
  for (const line of lines) {
    yield line;
  }
}

const collect = async (
  stream: AsyncGenerator<ParserYield>
): Promise<ParserYield[]> => {
  const results: ParserYield[] = [];
  for await (const item of stream) {
    results.push(item);
  }
  return results;
};

describe("parseStream", () => {
  // 1. Single SEARCH/REPLACE block
  it("parses a single SEARCH/REPLACE block", async () => {
    const input = [
      "filepath: src/index.ts\n",
      "<<<<<<< SEARCH\n",
      "const a = 1;\n",
      "=======\n",
      "const a = 2;\n",
      ">>>>>>> REPLACE\n",
    ].join("");

    const results = await collect(parseStream(toStream(input, 1000)));

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      filepath: "src/index.ts",
      type: "search_replace",
      search: "const a = 1;",
      replace: "const a = 2;",
    });
  });

  // 2. Multiple SEARCH/REPLACE blocks for different files
  it("parses multiple SEARCH/REPLACE blocks for different files", async () => {
    const input = [
      "filepath: src/a.ts\n",
      "<<<<<<< SEARCH\n",
      "old_a\n",
      "=======\n",
      "new_a\n",
      ">>>>>>> REPLACE\n",
      "filepath: src/b.ts\n",
      "<<<<<<< SEARCH\n",
      "old_b\n",
      "=======\n",
      "new_b\n",
      ">>>>>>> REPLACE\n",
    ].join("");

    const results = await collect(parseStream(toStream(input, 1000)));

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      filepath: "src/a.ts",
      type: "search_replace",
      search: "old_a",
      replace: "new_a",
    });
    expect(results[1]).toEqual({
      filepath: "src/b.ts",
      type: "search_replace",
      search: "old_b",
      replace: "new_b",
    });
  });

  // 3. Thinking block extraction
  it("extracts thinking blocks", async () => {
    const input = "<thinking>Let me analyze this code carefully.</thinking>";

    const results = await collect(parseStream(toStream(input, 1000)));

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      type: "thinking",
      content: "Let me analyze this code carefully.",
    });
  });

  // 4. New file (filepath + ```typescript code ```)
  it("parses new file with typescript code fence", async () => {
    const input = [
      "filepath: src/new-file.ts\n",
      "```typescript\n",
      "export const greet = (name: string): string => `Hello, ${name}`;\n",
      "```",
    ].join("");

    const results = await collect(parseStream(toStream(input, 1000)));

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      filepath: "src/new-file.ts",
      type: "new_file",
      content: "export const greet = (name: string): string => `Hello, ${name}`;",
    });
  });

  // 5. Markdown code fences in SEARCH/REPLACE
  it("strips opening code fence from SEARCH/REPLACE content", async () => {
    // stripCodeFences strips ^```\w*\n? from start and \n?```$ from end, then trims.
    // With standard line-based formatting, the search buffer accumulates a trailing \n
    // before the ======= divider, so the closing ``` is not at string end and
    // only the opening fence gets stripped by the regex.
    const input = [
      "filepath: src/index.ts\n",
      "<<<<<<< SEARCH\n",
      "```typescript\n",
      "const x = 1;\n",
      "```\n",
      "=======\n",
      "```typescript\n",
      "const x = 2;\n",
      "```\n",
      ">>>>>>> REPLACE\n",
    ].join("");

    const results = await collect(parseStream(toStream(input, 1000)));

    expect(results).toHaveLength(1);
    const block = results[0] as SearchReplaceBlock;
    expect(block.filepath).toBe("src/index.ts");
    expect(block.type).toBe("search_replace");
    expect(block.search).toBe("const x = 1;\n```");
    expect(block.replace).toBe("const x = 2;\n```");
  });

  // 6. Streamed chunks (split at line boundaries, simulating real LLM streaming)
  it("handles line-by-line streaming matching single-chunk output", async () => {
    const lines = [
      "filepath: src/index.ts\n",
      "<<<<<<< SEARCH\n",
      "const value = 42;\n",
      "=======\n",
      "const value = 99;\n",
      ">>>>>>> REPLACE\n",
    ];

    const lineByLine = await collect(parseStream(toLineStream(lines)));
    const singleChunk = await collect(
      parseStream(toStream(lines.join(""), 1000))
    );

    expect(lineByLine).toEqual(singleChunk);
    expect(lineByLine).toHaveLength(1);
    expect(lineByLine[0]).toEqual({
      filepath: "src/index.ts",
      type: "search_replace",
      search: "const value = 42;",
      replace: "const value = 99;",
    });
  });

  // 7. Empty response yields nothing
  it("yields nothing for empty response", async () => {
    const results = await collect(parseStream(toStream("")));
    expect(results).toHaveLength(0);
  });

  // 8. Multiple filepath markers update current file context
  it("handles multiple filepath markers updating current file context", async () => {
    const input = [
      "filepath: src/first.ts\n",
      "filepath: src/second.ts\n",
      "<<<<<<< SEARCH\n",
      "old_code\n",
      "=======\n",
      "new_code\n",
      ">>>>>>> REPLACE\n",
    ].join("");

    const results = await collect(parseStream(toStream(input, 1000)));

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      filepath: "src/second.ts",
      type: "search_replace",
      search: "old_code",
      replace: "new_code",
    });
  });

  // 9. SEARCH block with leading/trailing whitespace is trimmed
  it("trims leading/trailing whitespace in SEARCH/REPLACE via stripCodeFences", async () => {
    const input = [
      "filepath: src/app.ts\n",
      "<<<<<<< SEARCH\n",
      "  const trimmed = true;  \n",
      "=======\n",
      "  const trimmed = false;  \n",
      ">>>>>>> REPLACE\n",
    ].join("");

    const results = await collect(parseStream(toStream(input, 1000)));

    expect(results).toHaveLength(1);
    const block = results[0] as SearchReplaceBlock;
    expect(block.search).toBe("const trimmed = true;");
    expect(block.replace).toBe("const trimmed = false;");
  });

  // 10. Unicode content in code
  it("handles unicode content in code blocks", async () => {
    const input = [
      "filepath: src/i18n.ts\n",
      "<<<<<<< SEARCH\n",
      'const greeting = "Hello";\n',
      "=======\n",
      'const greeting = "\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435 \ud83c\udf1f";\n',
      ">>>>>>> REPLACE\n",
    ].join("");

    const results = await collect(parseStream(toStream(input, 1000)));

    expect(results).toHaveLength(1);
    const block = results[0] as SearchReplaceBlock;
    expect(block.replace).toBe(
      'const greeting = "\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435 \ud83c\udf1f";'
    );
  });

  // 11. Nested code blocks (escaped backticks) inside SEARCH/REPLACE
  it("handles nested code blocks inside SEARCH/REPLACE", async () => {
    const searchContent =
      "const md = `\\`\\`\\`js\\nconsole.log(1);\\n\\`\\`\\``;";
    const replaceContent =
      "const md = `\\`\\`\\`ts\\nconsole.log(2);\\n\\`\\`\\``;";
    const input = [
      "filepath: src/md.ts\n",
      "<<<<<<< SEARCH\n",
      `${searchContent}\n`,
      "=======\n",
      `${replaceContent}\n`,
      ">>>>>>> REPLACE\n",
    ].join("");

    const results = await collect(parseStream(toStream(input, 1000)));

    expect(results).toHaveLength(1);
    const block = results[0] as SearchReplaceBlock;
    expect(block.search).toBe(searchContent);
    expect(block.replace).toBe(replaceContent);
  });

  // 12. DELETE marker
  it("parses DELETE marker and sets current filepath", async () => {
    // DELETE marker sets currentFilepath but yields no block by itself
    // because the parser only yields when it has search+replace or code buffers
    const input = "DELETE: src/obsolete.ts\n";

    const results = await collect(parseStream(toStream(input, 1000)));

    expect(results).toHaveLength(0);
  });

  it("DELETE marker followed by SEARCH/REPLACE uses deleted filepath", async () => {
    // After DELETE sets the filepath, a subsequent SEARCH/REPLACE uses it
    const input = [
      "DELETE: src/target.ts\n",
      "<<<<<<< SEARCH\n",
      "old_code\n",
      "=======\n",
      "new_code\n",
      ">>>>>>> REPLACE\n",
    ].join("");

    const results = await collect(parseStream(toStream(input, 1000)));

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      filepath: "src/target.ts",
      type: "search_replace",
      search: "old_code",
      replace: "new_code",
    });
  });

  // 13. Thinking followed by SEARCH/REPLACE
  it("parses thinking block followed by SEARCH/REPLACE", async () => {
    const input = [
      "<thinking>I need to fix the import.</thinking>",
      "filepath: src/main.ts\n",
      "<<<<<<< SEARCH\n",
      'import { old } from "./old.js";\n',
      "=======\n",
      'import { updated } from "./new.js";\n',
      ">>>>>>> REPLACE\n",
    ].join("");

    const results = await collect(parseStream(toStream(input, 1000)));

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      type: "thinking",
      content: "I need to fix the import.",
    });
    expect(results[1]).toEqual({
      filepath: "src/main.ts",
      type: "search_replace",
      search: 'import { old } from "./old.js";',
      replace: 'import { updated } from "./new.js";',
    });
  });

  // 14. Mixed: thinking + new file + SEARCH/REPLACE in one stream
  it("handles mixed thinking + new file + SEARCH/REPLACE in one stream", async () => {
    // Use line-by-line streaming to avoid marker-splitting issues
    const lines = [
      "<thinking>Creating a new utility and updating the main file.</thinking>",
      "filepath: src/utils/helper.ts\n",
      "```typescript\n",
      "export const add = (a: number, b: number): number => a + b;\n",
      "```",
      "filepath: src/main.ts\n",
      "<<<<<<< SEARCH\n",
      "const sum = a + b;\n",
      "=======\n",
      "const sum = add(a, b);\n",
      ">>>>>>> REPLACE\n",
    ];

    const results = await collect(parseStream(toLineStream(lines)));

    expect(results).toHaveLength(3);

    expect(results[0]).toEqual({
      type: "thinking",
      content:
        "Creating a new utility and updating the main file.",
    });

    expect(results[1]).toEqual({
      filepath: "src/utils/helper.ts",
      type: "new_file",
      content:
        "export const add = (a: number, b: number): number => a + b;",
    });

    expect(results[2]).toEqual({
      filepath: "src/main.ts",
      type: "search_replace",
      search: "const sum = a + b;",
      replace: "const sum = add(a, b);",
    });
  });

  // 15. Large content handling
  it("handles large content without breaking", async () => {
    const largeLine = "x".repeat(10_000);
    const input = [
      "filepath: src/big.ts\n",
      "<<<<<<< SEARCH\n",
      `const big = "${largeLine}";\n`,
      "=======\n",
      `const big = "${largeLine}_updated";\n`,
      ">>>>>>> REPLACE\n",
    ].join("");

    const results = await collect(parseStream(toStream(input, 128)));

    expect(results).toHaveLength(1);
    const block = results[0] as SearchReplaceBlock;
    expect(block.type).toBe("search_replace");
    expect(block.search).toContain(largeLine);
    expect(block.replace).toContain(`${largeLine}_updated`);
  });

  // Additional: new file with ts code fence variant
  it("parses new file with ts code fence variant", async () => {
    const input = [
      "filepath: src/config.ts\n",
      "```ts\n",
      "export const PORT = 3000;\n",
      "```",
    ].join("");

    const results = await collect(parseStream(toStream(input, 1000)));

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      filepath: "src/config.ts",
      type: "new_file",
      content: "export const PORT = 3000;",
    });
  });

  // Additional: multiple SEARCH/REPLACE for the same file
  it("parses multiple SEARCH/REPLACE for the same file", async () => {
    const input = [
      "filepath: src/app.ts\n",
      "<<<<<<< SEARCH\n",
      "const a = 1;\n",
      "=======\n",
      "const a = 10;\n",
      ">>>>>>> REPLACE\n",
      "<<<<<<< SEARCH\n",
      "const b = 2;\n",
      "=======\n",
      "const b = 20;\n",
      ">>>>>>> REPLACE\n",
    ].join("");

    const results = await collect(parseStream(toStream(input, 1000)));

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      filepath: "src/app.ts",
      type: "search_replace",
      search: "const a = 1;",
      replace: "const a = 10;",
    });
    expect(results[1]).toEqual({
      filepath: "src/app.ts",
      type: "search_replace",
      search: "const b = 2;",
      replace: "const b = 20;",
    });
  });

  // Additional: multiline thinking
  it("handles thinking with multiline content", async () => {
    const thinkingContent =
      "Line one.\nLine two.\nLine three with special chars: <>&\"'";
    const input = `<thinking>${thinkingContent}</thinking>`;

    const results = await collect(parseStream(toStream(input, 20)));

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      type: "thinking",
      content: thinkingContent,
    });
  });

  // Additional: tsx code fence
  it("handles new file with tsx code fence", async () => {
    const input = [
      "filepath: src/App.tsx\n",
      "```tsx\n",
      "export const App = () => <div>Hello</div>;\n",
      "```",
    ].join("");

    const results = await collect(parseStream(toStream(input, 1000)));

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      filepath: "src/App.tsx",
      type: "new_file",
      content: "export const App = () => <div>Hello</div>;",
    });
  });

  // Additional: line-by-line streaming for chunk boundary test
  it("handles line-by-line streaming with all marker types", async () => {
    const lines = [
      "filepath: src/split.ts\n",
      "<<<<<<< SEARCH\n",
      "before\n",
      "=======\n",
      "after\n",
      ">>>>>>> REPLACE\n",
    ];

    const results = await collect(parseStream(toLineStream(lines)));

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      filepath: "src/split.ts",
      type: "search_replace",
      search: "before",
      replace: "after",
    });
  });

  // Additional: flush remaining buffers at stream end
  it("flushes remaining search/replace buffer when stream ends", async () => {
    // Stream ends without trailing newline after REPLACE marker
    const input = [
      "filepath: src/flush.ts\n",
      "<<<<<<< SEARCH\n",
      "old\n",
      "=======\n",
      "new\n",
      ">>>>>>> REPLACE",
    ].join("");

    const results = await collect(parseStream(toStream(input, 1000)));

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      filepath: "src/flush.ts",
      type: "search_replace",
      search: "old",
      replace: "new",
    });
  });

  // Additional: new file code flushed at stream end
  it("flushes remaining new file buffer when stream ends", async () => {
    const input = [
      "filepath: src/end.ts\n",
      "```typescript\n",
      "export const END = true;",
    ].join("");

    const results = await collect(parseStream(toStream(input, 1000)));

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      filepath: "src/end.ts",
      type: "new_file",
      content: "export const END = true;",
    });
  });

  // Additional: js code fence variant
  it("parses new file with js code fence", async () => {
    const input = [
      "filepath: src/utils.js\n",
      "```js\n",
      "module.exports = {};\n",
      "```",
    ].join("");

    const results = await collect(parseStream(toStream(input, 1000)));

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      filepath: "src/utils.js",
      type: "new_file",
      content: "module.exports = {};",
    });
  });

  // Additional: empty REPLACE block -- parser requires both buffers to be truthy,
  // so an empty replace means no yield (replaceBuffer is "" which is falsy)
  it("does not yield when REPLACE block is empty (truthy check)", async () => {
    const input = [
      "filepath: src/cleanup.ts\n",
      "<<<<<<< SEARCH\n",
      "const unused = 42;\n",
      "=======\n",
      ">>>>>>> REPLACE\n",
    ].join("");

    const results = await collect(parseStream(toStream(input, 1000)));

    // Empty replaceBuffer is falsy, so the yield condition is not met
    expect(results).toHaveLength(0);
  });
});
