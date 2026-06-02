// Confirms Metro is serving AND that the web bundle is compiled, so previews render
// immediately instead of showing a blank iframe while the first (large) bundle builds.
//
// fetch is injectable so the pipeline can drive readiness with a test seam; the
// warm-up step is fully best-effort and tolerates fakes that omit Response methods.

type FetchFn = typeof fetch;

const defaultFetch: FetchFn = globalThis.fetch.bind(globalThis);

// Expo serves index.html instantly, but the first JS bundle compile (Tamagui is heavy)
// can take tens of seconds. Fetching the bundle URL forces that compilation up front.
const warmMetroBundle = async (
  port: number,
  rootResp: Response,
  fetchFn: FetchFn
): Promise<void> => {
  try {
    if (typeof rootResp.text !== "function") return;
    const html = await rootResp.text();
    const match = html.match(/(?:src|href)="(\/[^"]*\.bundle[^"]*)"/);
    if (!match) return;
    await fetchFn(`http://127.0.0.1:${port}${match[1]}`, {
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    // Best-effort: the iframe will retrigger compilation if warming did not finish.
  }
};

export const waitForMetroReady = async (
  port: number,
  maxRetries = 40,
  fetchFn: FetchFn = defaultFetch
): Promise<boolean> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await fetchFn(`http://127.0.0.1:${port}`, {
        signal: AbortSignal.timeout(2000),
      });
      if (resp.ok) {
        await warmMetroBundle(port, resp, fetchFn);
        return true;
      }
    } catch {
      // Metro not accepting connections yet.
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  return false;
};
