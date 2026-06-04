import { describe, it, expect } from "vitest";
import { createProjectManagementSlice } from "./project-management-slice";
import type { ProjectEntry } from "../project-store.types";

// Minimal set-capturing harness so the slice can be exercised without the full store.
const harness = (projectList: ProjectEntry[]) => {
  let state: { projectList: ProjectEntry[]; projectChats: Record<string, unknown>; projectName: string | null } = {
    projectList,
    projectChats: {},
    projectName: null,
  };
  const set = (updater: unknown) => {
    const patch = typeof updater === "function" ? (updater as (s: typeof state) => Partial<typeof state>)(state) : updater;
    state = { ...state, ...(patch as Partial<typeof state>) };
  };
  const slice = createProjectManagementSlice(set as never);
  return { slice, get: () => state };
};

const entry = (name: string, over: Partial<ProjectEntry> = {}): ProjectEntry => ({
  name,
  displayName: name.toUpperCase(),
  status: "ready",
  port: null,
  createdAt: 1,
  ...over,
});

describe("addProject", () => {
  it("appends a genuinely new project to the end", () => {
    const { slice, get } = harness([entry("a"), entry("b")]);
    slice.addProject(entry("c"));
    expect(get().projectList.map((p) => p.name)).toEqual(["a", "b", "c"]);
  });

  it("updates an existing project IN PLACE without reordering the list", () => {
    const { slice, get } = harness([entry("a"), entry("b"), entry("c")]);
    // A lifecycle/status event re-adds an existing project — it must NOT jump to the end.
    slice.addProject(entry("a", { status: "generating", port: 8081 }));
    expect(get().projectList.map((p) => p.name)).toEqual(["a", "b", "c"]);
    expect(get().projectList[0].status).toBe("generating");
    expect(get().projectList[0].port).toBe(8081);
  });

  it("seeds an empty chat for a new project but leaves an existing chat intact", () => {
    const { slice, get } = harness([]);
    slice.addProject(entry("a")); // new → seeds an empty chat
    const chatA = get().projectChats.a;
    expect(chatA).toBeTruthy();
    // Re-adding "a" (a status update) must NOT replace its chat.
    slice.addProject(entry("a", { status: "generating" }));
    expect(get().projectChats.a).toBe(chatA);
    expect(get().projectList.map((p) => p.name)).toEqual(["a"]);
  });
});
