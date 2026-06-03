// Route and store markers for in-flight project creation from the welcome screen.
export const CREATING_PROJECT_SLUG = "__creating__";
export const CREATING_PENDING_KEY = "__creating__";

export const isCreatingRoute = (name: string | null | undefined): boolean =>
  name === CREATING_PROJECT_SLUG;

export const isPendingCreation = (pending: string | null | undefined): boolean =>
  pending === CREATING_PENDING_KEY;

export const isCreationSession = (options: {
  projectName: string | null;
  pendingProjectName: string | null;
}): boolean =>
  isCreatingRoute(options.projectName) || isPendingCreation(options.pendingProjectName);

/** Slug from the planner once plan_complete has been applied. */
export const getPlannedProjectSlug = (
  plan: Record<string, unknown> | null
): string | null => {
  const name = plan?.name;
  return typeof name === "string" && name.length > 0 ? name : null;
};

/**
 * When the URL is /project/__creating__, only navigate to a real slug after the
 * plan names the project and the store projectName matches — never a stale slug.
 */
export const getCreatingRouteSyncSlug = (options: {
  plan: Record<string, unknown> | null;
  projectName: string | null;
  pendingProjectName: string | null;
}): string | null => {
  if (!isPendingCreation(options.pendingProjectName) && !isCreatingRoute(options.projectName)) {
    return null;
  }

  const planned = getPlannedProjectSlug(options.plan);
  if (!planned || options.projectName !== planned) {
    return null;
  }

  return planned;
};
