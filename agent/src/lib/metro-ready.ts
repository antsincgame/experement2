// Confirms Metro is serving AND that the web bundle is compiled, so previews render
import { warnCaught } from "./catch-log.js";
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
  } catch (error) {
    warnCaught("metro-ready", error, `warm Metro bundle on port ${port}`);
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
      // ANY resolved HTTP response proves Metro is serving — even a 404. Apps
      // without a root "/" route (e.g. only /login) legitimately 404 the index,
      // yet the bundler is fully alive. Requiring 2xx here made a healthy Metro
      // look dead and surfaced a false "Metro is not responding" error.
      if (resp.ok) {
        // Only a 2xx index carries the HTML we can parse for the bundle URL.
        await warmMetroBundle(port, resp, fetchFn);
      }
      return true;
    } catch (error) {
      warnCaught("metro-ready", error, `wait for Metro on port ${port} (attempt ${i + 1})`);
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  return false;
};

// Expo's web dev server compiles lazily: it does NOT build the web bundle until
// a page is actually requested. The build-verification loop waits for a "Bundled"
// log that never arrives unless something hits the server first, which produced a
// false "Metro build timed out". This fires the initial page request to kick off
// that compilation. It tolerates the long first-bundle wait (90s) and connection
// refusals while Metro is still booting, returning once a request has landed.
export const triggerMetroBuild = async (
  port: number,
  maxRetries = 60,
  fetchFn: FetchFn = defaultFetch
): Promise<void> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // A resolved response (any status) means the request landed and the bundle
      // compile has been triggered; we are done regardless of the route's status.
      await fetchFn(`http://127.0.0.1:${port}`, {
        signal: AbortSignal.timeout(90_000),
      });
      return;
    } catch (error) {
      // AbortError (timeout) means the request DID land but compiling exceeded the
      // window — the build was still triggered, so stop. Other errors are the
      // server not yet accepting connections; retry.
      if (error instanceof Error && error.name === "TimeoutError") {
        return;
      }
    }
    await new Promise((r) => setTimeout(r, 750));
  }
};
