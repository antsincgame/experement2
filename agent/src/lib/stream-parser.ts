import type { SearchReplaceBlock } from "../schemas/search-replace.schema.js";

const SEARCH_MARKER = "<<<<<<< SEARCH";
const DIVIDER_MARKER = "=======";
const REPLACE_MARKER = ">>>>>>> REPLACE";
const FILEPATH_MARKER = "filepath:";
const DELETE_MARKER = "DELETE:";
const THINKING_OPEN = "<thinking>";
const THINKING_CLOSE = "</thinking>";

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
  searchBuffer: string;
  replaceBuffer: string;
  codeBuffer: string;
}

export async function* parseStream(
  stream: AsyncGenerator<string>
): AsyncGenerator<SearchReplaceBlock | { type: "thinking"; content: string }> {
  let fullBuffer = "";
  const state: ParserState = {
    mode: "idle",
    currentFilepath: "",
    thinkingBuffer: "",
    searchBuffer: "",
    replaceBuffer: "",
    codeBuffer: "",
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
}

const processBuffer = (buffer: string, state: ParserState): number => {
  if (state.mode === "thinking") {
    const closeIdx = buffer.indexOf(THINKING_CLOSE);
    if (closeIdx === -1) {
      state.thinkingBuffer += buffer;
      return buffer.length;
    }
    state.thinkingBuffer += buffer.slice(0, closeIdx);
    state.mode = "idle";
    return closeIdx + THINKING_CLOSE.length;
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
  if (buffer.startsWith(THINKING_OPEN)) {
    state.mode = "thinking";
    state.thinkingBuffer = "";
    return THINKING_OPEN.length;
  }

  const deleteIdx = buffer.indexOf(DELETE_MARKER);
  if (deleteIdx === 0) {
    const lineEnd = buffer.indexOf("\n", DELETE_MARKER.length);
    const filepath = buffer
      .slice(DELETE_MARKER.length, lineEnd > 0 ? lineEnd : undefined)
      .trim();
    state.currentFilepath = filepath;
    state.codeBuffer = "";
    // yield delete signal — handled by caller
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

  const codeFenceMatch = buffer.match(/^```(?:typescript|tsx|ts|jsx|js)\n/);
  if (codeFenceMatch && state.currentFilepath) {
    state.mode = "new_file_code";
    state.codeBuffer = "";
    return codeFenceMatch[0].length;
  }

  // skip single character if nothing matches
  return 1;
};
