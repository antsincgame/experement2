// Map Metro absolute paths to editable project-relative paths (src/... or app/...).

export const toEditableProjectPath = (file: string): string => {
  const norm = file.replace(/\\/g, "/").trim();
  if (!norm || norm === "unknown") return "";
  if (/(?:^|\/)node_modules(?:\/|$)/.test(norm)) return "";

  const rel = norm.match(/(?:^|\/)((?:src|app)\/.+\.(?:tsx?|jsx?))$/)?.[1];
  if (rel) return rel;

  if (/^(?:[a-zA-Z]:\/|\/)/.test(norm)) return "";
  return norm;
};
