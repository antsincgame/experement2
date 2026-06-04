// Resume generation: resolve project slug from route/store and detect "continue" chat intents.
import { CREATING_PROJECT_SLUG, isCreatingRoute } from "@/shared/lib/creation-flow";

export const resolveResumeProjectName = (
  routeProjectName: string | null,
  storeProjectName: string | null,
): string | null => {
  if (routeProjectName && !isCreatingRoute(routeProjectName)) {
    return routeProjectName;
  }
  if (storeProjectName && !isCreatingRoute(storeProjectName) && storeProjectName !== CREATING_PROJECT_SLUG) {
    return storeProjectName;
  }
  return null;
};

/** User meant "resume codegen", not "edit the project" (iterate). */
export const isContinueGenerationMessage = (text: string): boolean =>
  /^(продолж|continue|resume|go on|keep going|дальше|сгенерируй|догенерируй)/i.test(text.trim());
