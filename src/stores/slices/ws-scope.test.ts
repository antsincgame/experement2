import { describe, expect, it } from "vitest";
import { CREATING_PENDING_KEY, CREATING_PROJECT_SLUG } from "@/shared/lib/creation-flow";
import type { ProjectState } from "../project-store.types";
import { matchesActiveProject } from "./ws-scope";

const REQUEST_ID = "req-1111-1111-1111-111111111111";

const baseState = (): ProjectState =>
  ({
    projectName: "old-app",
    pendingProjectName: CREATING_PENDING_KEY,
    pendingCreationRequestId: REQUEST_ID,
    plan: { name: "new-app" },
    status: "ready",
    projectList: [],
    messages: [],
    projectChats: {},
  }) as unknown as ProjectState;

describe("matchesActiveProject", () => {
  it("rejects creation events for new-app while user views old-app", () => {
    const get = () => baseState();
    const matches = matchesActiveProject(get, {
      type: "file_generating",
      requestId: REQUEST_ID,
      projectName: "new-app",
      filepath: "app/index.tsx",
      progress: 0.1,
    });
    expect(matches).toBe(false);
  });

  it("accepts creation events on __creating__ route", () => {
    const get = () =>
      ({
        ...baseState(),
        projectName: CREATING_PROJECT_SLUG,
      }) as ProjectState;
    const matches = matchesActiveProject(get, {
      type: "plan_chunk",
      requestId: REQUEST_ID,
      chunk: "{}",
    });
    expect(matches).toBe(true);
  });
});
