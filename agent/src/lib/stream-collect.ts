// Drains an async generator of string chunks into one concatenated string.
// Extracted because the non-streaming model calls (editor analyze, contract and
// type-error regeneration, truncation continuation) each repeated this loop.
export const collectStream = async (
  stream: AsyncGenerator<string>
): Promise<string> => {
  let out = "";
  for await (const chunk of stream) {
    out += chunk;
  }
  return out;
};
