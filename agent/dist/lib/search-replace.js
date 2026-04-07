const normalizeLine = (line) => line.replace(/\s+$/g, "").replace(/\t/g, "  ");
const fuzzyLineMatch = (contentLine, searchLine) => contentLine.trim() === searchLine.trim() ||
    normalizeLine(contentLine) === normalizeLine(searchLine);
const splitSearchLines = (search) => search
    .split("\n")
    .filter((line) => line.trim() !== "" || search.includes("\n\n"));
const replaceLineRange = (contentLines, match, replacement) => [
    ...contentLines.slice(0, match.start),
    replacement,
    ...contentLines.slice(match.end),
].join("\n");
const adjustReplacementIndentation = (replace, originalIndent, searchIndent) => {
    if (originalIndent === searchIndent) {
        return replace;
    }
    return replace
        .split("\n")
        .map((line) => {
        if (!line.startsWith(searchIndent)) {
            return line;
        }
        return originalIndent + line.slice(searchIndent.length);
    })
        .join("\n");
};
const findFuzzyMatchRange = (contentLines, searchLines) => {
    for (let start = 0; start <= contentLines.length - searchLines.length; start++) {
        let contentIndex = start;
        let searchIndex = 0;
        while (searchIndex < searchLines.length && contentIndex < contentLines.length) {
            const searchLine = searchLines[searchIndex];
            if (searchLine.trim() === "" && contentLines[contentIndex].trim() !== "") {
                searchIndex++;
                continue;
            }
            if (!fuzzyLineMatch(contentLines[contentIndex], searchLine)) {
                break;
            }
            searchIndex++;
            contentIndex++;
        }
        if (searchIndex === searchLines.length) {
            return { start, end: contentIndex };
        }
    }
    return null;
};
const findTrimmedMatchRange = (contentLines, searchLines) => {
    const normalizedSearch = searchLines.map((line) => line.trim()).join("\n");
    for (let start = 0; start <= contentLines.length - searchLines.length; start++) {
        const candidate = contentLines
            .slice(start, start + searchLines.length)
            .map((line) => line.trim())
            .join("\n");
        if (candidate === normalizedSearch) {
            return { start, end: start + searchLines.length };
        }
    }
    return null;
};
export const applySearchReplace = (content, search, replace) => {
    if (content.includes(search)) {
        // Replace first occurrence only — safe even with multiple matches
        const idx = content.indexOf(search);
        const result = content.slice(0, idx) + replace + content.slice(idx + search.length);
        return { result, error: null };
    }
    const searchLines = splitSearchLines(search);
    if (searchLines.length === 0) {
        return { result: null, error: "Empty search block." };
    }
    const contentLines = content.split("\n");
    const match = findFuzzyMatchRange(contentLines, searchLines) ??
        findTrimmedMatchRange(contentLines, searchLines);
    if (!match) {
        return {
            result: null,
            error: "Search block not found in file. Content may have changed.",
        };
    }
    const originalIndent = contentLines[match.start]?.match(/^(\s*)/)?.[1] ?? "";
    const searchIndent = searchLines[0]?.match(/^(\s*)/)?.[1] ?? "";
    const adjustedReplace = adjustReplacementIndentation(replace, originalIndent, searchIndent);
    return {
        result: replaceLineRange(contentLines, match, adjustedReplace),
        error: null,
    };
};
//# sourceMappingURL=search-replace.js.map