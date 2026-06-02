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
