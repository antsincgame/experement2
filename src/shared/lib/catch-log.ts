// Logs swallowed catch fallbacks — console for devtools, settings log when the store is loadable.

export const formatCaught = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const pushToSettingsLog = (context: string, message: string): void => {
  void import("@/stores/settings-store")
    .then(({ useSettingsStore }) => {
      useSettingsStore.getState().addErrorLog({
        level: "warn",
        source: context,
        message,
      });
    })
    .catch(() => undefined);
};

export const warnCaught = (
  context: string,
  error: unknown,
  detail?: string,
): void => {
  const body = formatCaught(error);
  const message = detail ? `${detail}: ${body}` : body;
  console.warn(`[${context}] ${message}`);
  pushToSettingsLog(context, message);
};
