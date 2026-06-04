// Formats agent build_event payloads into concise chat process lines.
export const formatBuildEventLine = (
  eventType: string,
  message?: string,
  error?: string,
): string => {
  if (eventType === "moe_swap" && message) {
    return message;
  }
  if (eventType === "self_healing" && message) {
    return message;
  }
  if (eventType === "build_error") {
    const detail = error?.trim() || message?.trim();
    return detail ? `Build error: ${detail.slice(0, 280)}` : "Build error";
  }
  if (eventType === "build_success") {
    return message?.trim() || "Metro bundle ready";
  }
  if (eventType === "pipeline_notice" && message) {
    return message;
  }
  if (message?.trim()) {
    return message.trim();
  }
  return eventType.replace(/_/g, " ");
};
