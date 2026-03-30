import net from "net";

const isPortFree = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });

export const findFreePort = async (startPort = 30000): Promise<number> => {
  const MAX_ATTEMPTS = 100;

  for (let offset = 0; offset < MAX_ATTEMPTS; offset++) {
    const port = startPort + offset;
    const free = await isPortFree(port);
    if (free) return port;
  }

  throw new Error(
    `No free port found in range ${startPort}-${startPort + MAX_ATTEMPTS}`
  );
};
