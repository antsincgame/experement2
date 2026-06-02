// Test harness for the model boundary. Pair with the `complete` parameter that
// generator/editor accept (dependency injection) — pass a function that returns
// streamOf(<scripted model response>). No module mocking, so the tests are plain
// to read and step through in any editor.

/** Wrap a full model response as the single-chunk async stream a completion yields. */
export const streamOf = (text: string): AsyncGenerator<string> =>
  (async function* () {
    yield text;
  })();
