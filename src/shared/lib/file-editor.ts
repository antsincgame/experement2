// Pure helpers for in-browser file editing state (draft vs saved content).
export const getEditorContent = (
  fileContents: Record<string, string>,
  fileDrafts: Record<string, string>,
  path: string
): string => fileDrafts[path] ?? fileContents[path] ?? "";

export const isFileDirty = (
  fileContents: Record<string, string>,
  fileDrafts: Record<string, string>,
  path: string
): boolean => {
  if (!(path in fileDrafts)) {
    return false;
  }
  return fileDrafts[path] !== (fileContents[path] ?? "");
};
