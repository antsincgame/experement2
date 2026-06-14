// Shared preview restart after on-disk code changes — iterate + revert must use the same contract.
import crypto from "crypto";
import { spawnSync } from "child_process";
import { getPreviewPort, setPreviewPort } from "./event-bus.js";
import { triggerMetroBuild, waitForMetroReady } from "./metro-ready.js";
import {
  getActivePort,
  isRunning,
  killExpo,
  startExpoClearCache,
} from "../services/process-manager.js";
import type { LogCallback } from "../services/log-watcher.js";
import type { OutboundMessage } from "./ws-contract.js";

const isWindows = process.platform === "win32";

/** Active Metro handle wins; fall back to the last announced preview port for this project. */
export const resolveTrackedPreviewPort = (projectName: string): number | null =>
  getActivePort(projectName) ?? getPreviewPort(projectName);

const killWindowsListenerOnPort = (port: number): void => {
  const script =
    `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ` +
    "Select-Object -ExpandProperty OwningProcess -Unique";
  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8", windowsHide: true, timeout: 10_000 }
  );
  const pids = (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+$/.test(line));
  for (const pid of pids) {
    spawnSync("taskkill", ["/pid", pid, "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
      timeout: 10_000,
    });
  }
};

const killUnixListenerOnPort = (port: number): void => {
  const result = spawnSync("lsof", ["-ti", `tcp:${port}`], {
    encoding: "utf8",
    timeout: 10_000,
  });
  const pids = (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+$/.test(line));
  for (const pid of pids) {
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch {
      // Process may have already exited.
    }
  }
};

/** Reclaim a Metro listener when the agent lost the ChildProcess handle but the port is still busy. */
export const killOrphanedListenerOnPort = (port: number): void => {
  if (isWindows) {
    killWindowsListenerOnPort(port);
    return;
  }
  killUnixListenerOnPort(port);
};

export interface RestartProjectPreviewResult {
  restarted: boolean;
  port: number | null;
}

/**
 * Restart the project's Metro preview with a cleared cache so the web bundle matches
 * the current on-disk sources. No-op when no preview port is tracked for the project.
 *
 * @param knownPortHint — port captured before killExpo (revert clears the registry).
 */
export const restartProjectPreview = async (
  projectName: string,
  projectPath: string,
  emit: (message: OutboundMessage) => void,
  knownPortHint?: number | null
): Promise<RestartProjectPreviewResult> => {
  const knownPort = knownPortHint ?? resolveTrackedPreviewPort(projectName);
  if (!knownPort) {
    return { restarted: false, port: null };
  }

  const buildId = crypto.randomUUID();
  emit({ type: "reloading_preview" });
  emit({ type: "preview_status", previewStatus: "starting", buildId });

  if (!isRunning(projectName)) {
    killOrphanedListenerOnPort(knownPort);
  }
  killExpo(projectName);

  const onLog: LogCallback = (event) => {
    emit({
      type: "build_event",
      buildId,
      eventType: event.type,
      message: event.message,
      error: event.error,
    });
  };

  const { port: restartedPort } = await startExpoClearCache(
    projectName,
    projectPath,
    knownPort,
    onLog
  );
  setPreviewPort(projectName, restartedPort);

  void triggerMetroBuild(restartedPort).catch((error) => {
    console.warn(
      `[PreviewRestart] triggerMetroBuild failed (ignored): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  });

  if (!(await waitForMetroReady(restartedPort, 60))) {
    // Without a terminal event the client stays stuck on the `starting` state we
    // emitted above. Surface the failure so the UI leaves the spinner and shows why.
    emit({
      type: "preview_status",
      previewStatus: "error",
      buildId,
      error: `Metro did not become ready on port ${restartedPort} after restart.`,
    });
    return { restarted: false, port: restartedPort };
  }

  emit({
    type: "preview_ready",
    buildId,
    port: restartedPort,
    proxyUrl: `/preview/${encodeURIComponent(projectName)}/`,
  });
  emit({ type: "preview_status", previewStatus: "ready", buildId });
  emit({
    type: "build_event",
    eventType: "build_success",
    message: "Metro bundle ready",
    buildId,
  });

  return { restarted: true, port: restartedPort };
};
