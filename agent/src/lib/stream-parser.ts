import type { SearchReplaceBlock } from "../schemas/search-replace.schema.js";

const SEARCH_MARKER = "<<<<<<< SEARCH";
const DIVIDER_MARKER = "=======";
const REPLACE_MARKER = ">>>>>>> REPLACE";
const FILEPATH_MARKER = "filepath:";
const DELETE_MARKER = "DELETE:";

// Reasoning-model variants: <thinking> (editor),  (DeepSeek-R1),
// <think> (Qwen3 / LM Studio).
const THINKING_TAGS: ReadonlyArray<{ open: string; close: string }> = [
  { open: "<thinking>", close: "</thinking>" },
  { open: "\u003cthink\u003e", close: "\u003c/think\u003e" },
  { open: "<think>", close: "</think>" },
];

const stripCodeFences = (text: string): string =>
  text
    .replace(/^```\w*\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

interface ParserState {
  mode:
    | "idle"
    | "thinking"
    | "search"
    | "replace"
    | "new_file_code";
  currentFilepath: string;
  thinkingBuffer: string;
  thinkingClose: string;
  searchBuffer: string;
  replaceBuffer: string;
  codeBuffer: string;
  pendingDelete: string;
}

export async function* parseStream(
  stream: AsyncGenerator<string>
): AsyncGenerator<SearchReplaceBlock | { type: "thinking"; content: string }> {
  let fullBuffer = "";
  const state: ParserState = {
    mode: "idle",
    currentFilepath: "",
    thinkingBuffer: "",
    thinkingClose: "</thinking>",
    searchBuffer: "",
    replaceBuffer: "",
    codeBuffer: "",
    pendingDelete: "",
  };

  for await (const chunk of stream) {
    fullBuffer += chunk;

    while (fullBuffer.length > 0) {
      const consumed = processBuffer(fullBuffer, state);

      if (consumed === 0) break;

      fullBuffer = fullBuffer.slice(consumed);

      if (state.mode === "idle" && state.thinkingBuffer) {
        yield { type: "thinking", content: state.thinkingBuffer };
        state.thinkingBuffer = "";
      }

      if (state.mode === "idle" && state.pendingDelete) {
        yield { filepath: state.pendingDelete, type: "delete" };
        state.pendingDelete = "";
      }

      if (
        state.mode === "idle" &&
        state.searchBuffer &&
        state.replaceBuffer
      ) {
        yield {
          filepath: state.currentFilepath,
          type: "search_replace",
          search: stripCodeFences(state.searchBuffer),
          replace: stripCodeFences(state.replaceBuffer),
        };
        state.searchBuffer = "";
        state.replaceBuffer = "";
      }

      if (state.mode === "idle" && state.codeBuffer) {
        yield {
          filepath: state.currentFilepath,
          type: "new_file",
          content: stripCodeFences(state.codeBuffer),
        };
        state.codeBuffer = "";
      }
    }
  }

  if (state.searchBuffer && state.replaceBuffer) {
    yield {
      filepath: state.currentFilepath,
      type: "search_replace",
      search: stripCodeFences(state.searchBuffer),
      replace: stripCodeFences(state.replaceBuffer),
    };
  }

  if (state.codeBuffer) {
    yield {
      filepath: state.currentFilepath,
      type: "new_file",
      content: stripCodeFences(state.codeBuffer),
    };
  }

  if (state.mode === "thinking") {
    if (state.thinkingBuffer.trim()) {
      yield { type: "thinking", content: state.thinkingBuffer };
    }
    state.mode = "idle";
    state.thinkingBuffer = "";
  }
}

const processBuffer = (buffer: string, state: ParserState): number => {
  if (state.mode === "thinking") {
    const closeTag = state.thinkingClose;
    const closeIdx = buffer.indexOf(closeTag);
    if (closeIdx === -1) {
      state.thinkingBuffer += buffer;
      return buffer.length;
    }
    state.thinkingBuffer += buffer.slice(0, closeIdx);
    state.mode = "idle";
    return closeIdx + closeTag.length;
  }

  if (state.mode === "search") {
    const dividerIdx = buffer.indexOf(DIVIDER_MARKER);
    if (dividerIdx === -1) {
      state.searchBuffer += buffer;
      return buffer.length;
    }
    state.searchBuffer += buffer.slice(0, dividerIdx);
    state.mode = "replace";
    return dividerIdx + DIVIDER_MARKER.length + (buffer[dividerIdx + DIVIDER_MARKER.length] === "\n" ? 1 : 0);
  }

  if (state.mode === "replace") {
    const replaceEndIdx = buffer.indexOf(REPLACE_MARKER);
    if (replaceEndIdx === -1) {
      state.replaceBuffer += buffer;
      return buffer.length;
    }
    state.replaceBuffer += buffer.slice(0, replaceEndIdx);
    state.mode = "idle";
    return replaceEndIdx + REPLACE_MARKER.length + (buffer[replaceEndIdx + REPLACE_MARKER.length] === "\n" ? 1 : 0);
  }

  if (state.mode === "new_file_code") {
    const endFence = buffer.indexOf("\n```");
    if (endFence === -1 && !buffer.endsWith("```")) {
      state.codeBuffer += buffer;
      return buffer.length;
    }
    const actualEnd = endFence >= 0 ? endFence : buffer.length - 3;
    state.codeBuffer += buffer.slice(0, actualEnd);
    state.mode = "idle";
    return actualEnd + (endFence >= 0 ? 4 : 3);
  }

  // idle mode
  for (const tag of THINKING_TAGS) {
    if (buffer.startsWith(tag.open)) {
      state.mode = "thinking";
      state.thinkingBuffer = "";
      state.thinkingClose = tag.close;
      return tag.open.length;
    }
  }
  // Wait for more data if the buffer is a partial prefix of any opening tag,
  // so a chunk boundary mid-tag (e.g. "<thin") does not get skipped.
  if (THINKING_TAGS.some((tag) => tag.open.startsWith(buffer))) {
    return 0;
  }

  const deleteIdx = buffer.indexOf(DELETE_MARKER);
  if (deleteIdx === 0) {
    const lineEnd = buffer.indexOf("\n", DELETE_MARKER.length);
    const filepath = buffer
      .slice(DELETE_MARKER.length, lineEnd > 0 ? lineEnd : undefined)
      .trim();
    state.pendingDelete = filepath;
    // delete block is yielded by parseStream once this returns to idle
    return (lineEnd > 0 ? lineEnd + 1 : buffer.length);
  }

  const filepathIdx = buffer.indexOf(FILEPATH_MARKER);
  if (filepathIdx === 0) {
    const lineEnd = buffer.indexOf("\n", FILEPATH_MARKER.length);
    if (lineEnd === -1) return 0; // wait for more data
    state.currentFilepath = buffer.slice(FILEPATH_MARKER.length, lineEnd).trim();
    return lineEnd + 1;
  }

  const searchIdx = buffer.indexOf(SEARCH_MARKER);
  if (searchIdx === 0) {
    state.mode = "search";
    state.searchBuffer = "";
    const afterMarker = SEARCH_MARKER.length + (buffer[SEARCH_MARKER.length] === "\n" ? 1 : 0);
    return afterMarker;
  }

  // Accept ANY language tag (or a bare fence) after a filepath: header. The old
  // allow-list missed the common `javascript` tag and bare ``` fences, so those
  // new files were dropped char-by-char and silently never created.
  const codeFenceMatch = buffer.match(/^```[a-zA-Z0-9_+-]*\n/);
  if (codeFenceMatch && state.currentFilepath) {
    state.mode = "new_file_code";
    state.codeBuffer = "";
    return codeFenceMatch[0].length;
  }

  // skip single character if nothing matches
  return 1;
};
