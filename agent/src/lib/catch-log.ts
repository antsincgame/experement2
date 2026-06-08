// Shared formatting for swallowed catch blocks — keeps graceful fallbacks but logs why they fired.

export const formatCaught = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const warnCaught = (
  context: string,
  error: unknown,
  detail?: string,
): void => {
  const message = formatCaught(error);
  if (detail) {
    console.warn(`[${context}] ${detail}: ${message}`);
    return;
  }
  console.warn(`[${context}] ${message}`);
};
