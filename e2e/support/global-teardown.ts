// Stops only the runtime processes that the Playwright setup started itself.
import type { FullConfig } from "@playwright/test";
import { stopStartedRuntimeProcesses } from "./runtime-manager";

export default async function globalTeardown(_config: FullConfig): Promise<void> {
  stopStartedRuntimeProcesses();
}
