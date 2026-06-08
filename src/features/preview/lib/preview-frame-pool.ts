// Keep-alive LRU for preview iframes. The preview iframe is cross-origin (served
// straight from each project's Metro port), so its pixels can't be screenshotted
// client-side. Instead we keep a bounded set of previously-viewed iframes mounted
// but hidden: the browser retains each one's last painted frame even after the
// server evicts its Metro process, so switching back shows the real last frame
// instantly while the preview wakes underneath.

export interface PreviewFrame {
  projectName: string;
  /** Direct Metro URL (with cache-busting revision) the iframe last loaded. */
  src: string;
}

/**
 * Promote `projectName` to most-recently-used with `src`, capping the pool so only
 * the last `cap` viewed previews stay mounted (older iframes unmount, freeing client
 * memory). Returns the SAME array reference when nothing changes so React/useState
 * can bail out of a re-render.
 */
export const upsertPreviewFrame = (
  frames: PreviewFrame[],
  projectName: string,
  src: string,
  cap: number,
): PreviewFrame[] => {
  const isAlreadyHead =
    frames[0]?.projectName === projectName && frames[0]?.src === src;
  if (isAlreadyHead) {
    return frames;
  }
  const without = frames.filter((frame) => frame.projectName !== projectName);
  return [{ projectName, src }, ...without].slice(0, Math.max(1, cap));
};

/**
 * Drop frames whose project no longer exists (removed/renamed) so a dead iframe is
 * not kept mounted. Returns the same reference when nothing was pruned.
 */
export const prunePreviewFrames = (
  frames: PreviewFrame[],
  liveProjectNames: Iterable<string>,
): PreviewFrame[] => {
  const live = new Set(liveProjectNames);
  const next = frames.filter((frame) => live.has(frame.projectName));
  return next.length === frames.length ? frames : next;
};

export interface PreviewDisplay {
  /** Cover the surface with the loading/error/empty placeholder. */
  showPlaceholder: boolean;
  /** A cached frame is shown while its preview respawns — surface a subtle "waking" hint. */
  isWaking: boolean;
}

/**
 * Decide what the surface shows for the active project. The frozen/live cached frame
 * wins whenever one exists and the preview is not errored — including while it wakes
 * (not yet ready), which is the whole point: a seamless frame instead of a spinner.
 */
export const resolvePreviewDisplay = (input: {
  hasActiveFrame: boolean;
  isError: boolean;
  isReady: boolean;
}): PreviewDisplay => ({
  showPlaceholder: !input.hasActiveFrame || input.isError,
  isWaking: input.hasActiveFrame && !input.isError && !input.isReady,
});
