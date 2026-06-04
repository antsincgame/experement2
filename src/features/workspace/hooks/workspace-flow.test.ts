// Exercises workspace orchestration helpers so route-to-store flows stay stable across project switches.
import { describe, expect, it, vi } from "vitest";
import {
  hydrateStoredProjects,
  openProjectWorkspace,
} from "./workspace-flow";

describe("hydrateStoredProjects", () => {
  it("pushes disk projects into the store format", () => {
    const addProject = vi.fn();

    hydrateStoredProjects({
      projects: [
        { name: "demo", displayName: "Demo", createdAt: 123 },
      ],
      addProject,
    });

    expect(addProject).toHaveBeenCalledWith({
      name: "demo",
      displayName: "Demo",
      status: "ready",
      port: null,
      createdAt: 123,
      canResume: undefined,
      missingFileCount: undefined,
    });
  });
});

describe("openProjectWorkspace", () => {
  it("hydrates files and starts preview for an existing project", async () => {
    const switchProject = vi.fn();
    const fetchProjectFiles = vi.fn().mockResolvedValue({ "app.tsx": "ok" });
    const startPreview = vi.fn();
    const onMissingProject = vi.fn();

    await openProjectWorkspace({
      currentProjectName: "alpha",
      projectName: "beta",
      switchProject,
      fetchProjectFiles,
      startPreview,
      onMissingProject,
    });

    expect(switchProject).toHaveBeenCalledWith("beta");
    expect(fetchProjectFiles).toHaveBeenCalledWith("beta");
    expect(startPreview).toHaveBeenCalledWith("beta");
    expect(onMissingProject).not.toHaveBeenCalled();
  });

  it("skips file fetch for the in-flight creation route", async () => {
    const switchProject = vi.fn();
    const fetchProjectFiles = vi.fn();
    const startPreview = vi.fn();

    await openProjectWorkspace({
      currentProjectName: null,
      projectName: "__creating__",
      switchProject,
      fetchProjectFiles,
      startPreview,
      onMissingProject: vi.fn(),
    });

    expect(switchProject).toHaveBeenCalledWith("__creating__");
    expect(fetchProjectFiles).not.toHaveBeenCalled();
    expect(startPreview).not.toHaveBeenCalled();
  });

  it("redirects when project files cannot be loaded", async () => {
    const startPreview = vi.fn();
    const onMissingProject = vi.fn();

    await openProjectWorkspace({
      currentProjectName: "alpha",
      projectName: "beta",
      switchProject: vi.fn(),
      fetchProjectFiles: vi.fn().mockResolvedValue(null),
      startPreview,
      onMissingProject,
    });

    expect(startPreview).not.toHaveBeenCalled();
    expect(onMissingProject).toHaveBeenCalledTimes(1);
  });
});
