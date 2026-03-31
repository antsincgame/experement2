import { describe, it, expect } from "vitest";
import net from "net";
import { findFreePort } from "./port-finder.js";
describe("port-finder", () => {
    it("finds a free port >= 30000 by default", async () => {
        const port = await findFreePort();
        expect(port).toBeGreaterThanOrEqual(30000);
    });
    it("returns a number", async () => {
        const port = await findFreePort();
        expect(typeof port).toBe("number");
        expect(Number.isInteger(port)).toBe(true);
    });
    it("respects custom startPort", async () => {
        const port = await findFreePort(40000);
        expect(port).toBeGreaterThanOrEqual(40000);
    });
    it("repeated calls return valid ports", async () => {
        const port1 = await findFreePort();
        const port2 = await findFreePort();
        expect(port1).toBeGreaterThanOrEqual(30000);
        expect(port2).toBeGreaterThanOrEqual(30000);
    });
    it("returned port is actually available (can bind to it)", async () => {
        const port = await findFreePort();
        const canBind = await new Promise((resolve) => {
            const server = net.createServer();
            server.once("error", () => resolve(false));
            server.once("listening", () => {
                server.close(() => resolve(true));
            });
            server.listen(port, "127.0.0.1");
        });
        expect(canBind).toBe(true);
    });
    it("skips occupied port and finds next free one", async () => {
        const blockingServer = net.createServer();
        const blockedPort = await new Promise((resolve, reject) => {
            blockingServer.listen(35000, "127.0.0.1", () => {
                const addr = blockingServer.address();
                if (addr && typeof addr === "object") {
                    resolve(addr.port);
                }
                else {
                    reject(new Error("Failed to bind blocking server"));
                }
            });
        });
        try {
            const freePort = await findFreePort(blockedPort);
            expect(freePort).toBeGreaterThan(blockedPort);
        }
        finally {
            await new Promise((resolve) => blockingServer.close(() => resolve()));
        }
    });
});
//# sourceMappingURL=port-finder.test.js.map