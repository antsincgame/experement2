// Guards creation-route sync so stale store slugs cannot hijack navigation.
import { describe, expect, it } from "vitest";
import {
  CREATING_PENDING_KEY,
  CREATING_PROJECT_SLUG,
  getCreatingRouteSyncSlug,
  getPlannedProjectSlug,
} from "./creation-flow";

describe("getPlannedProjectSlug", () => {
  it("returns plan.name when present", () => {
    expect(getPlannedProjectSlug({ name: "expense-tracker", screens: [] })).toBe(
      "expense-tracker"
    );
  });

  it("returns null when plan is missing or invalid", () => {
    expect(getPlannedProjectSlug(null)).toBeNull();
    expect(getPlannedProjectSlug({ displayName: "X" })).toBeNull();
  });
});

describe("getCreatingRouteSyncSlug", () => {
  it("stays on __creating__ when store still has a stale previous slug", () => {
    expect(
      getCreatingRouteSyncSlug({
        plan: null,
        projectName: "tactile-habit-engine",
        pendingProjectName: CREATING_PENDING_KEY,
      })
    ).toBeNull();
  });

  it("syncs only after plan and store agree on the new slug", () => {
    expect(
      getCreatingRouteSyncSlug({
        plan: { name: "premium-expense" },
        projectName: "premium-expense",
        pendingProjectName: CREATING_PENDING_KEY,
      })
    ).toBe("premium-expense");
  });

  it("does not sync when plan names a project but store is behind", () => {
    expect(
      getCreatingRouteSyncSlug({
        plan: { name: "premium-expense" },
        projectName: "tactile-habit-engine",
        pendingProjectName: CREATING_PENDING_KEY,
      })
    ).toBeNull();
  });

  it("syncs when store uses the creating slug until plan_complete", () => {
    expect(
      getCreatingRouteSyncSlug({
        plan: { name: "premium-expense" },
        projectName: CREATING_PROJECT_SLUG,
        pendingProjectName: CREATING_PENDING_KEY,
      })
    ).toBeNull();
  });
});
