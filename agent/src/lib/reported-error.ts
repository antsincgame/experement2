// Lets a deep handler (e.g. the create pipeline) tell the generic operation-queue
// catch that it already surfaced this error to the client, preventing a duplicate
// system_error message in chat.
const REPORTED_FLAG = "__reportedToClient";

export const markErrorReported = (error: unknown): void => {
  if (error && typeof error === "object") {
    (error as Record<string, unknown>)[REPORTED_FLAG] = true;
  }
};

export const isErrorReported = (error: unknown): boolean =>
  Boolean(
    error &&
      typeof error === "object" &&
      (error as Record<string, unknown>)[REPORTED_FLAG] === true
  );
