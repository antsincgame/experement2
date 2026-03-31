import { SAFE_EXTRA_DEPENDENCIES, TEMPLATE_PACKAGE_DEPENDENCIES } from "./generation-contract.js";

const REGISTRY_TIMEOUT_MS = 5000;

const checkNpmPackageExists = async (packageName: string): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REGISTRY_TIMEOUT_MS);

    const encoded = encodeURIComponent(packageName);
    const resp = await fetch(`https://registry.npmjs.org/${encoded}`, {
      method: "HEAD",
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return resp.ok;
  } catch {
    // Network error or timeout — assume it exists to avoid false negatives
    return true;
  }
};

/**
 * Filters extraDependencies: removes already-bundled deps, validates against
 * safe-list and npm registry. Returns only installable packages.
 */
export const validateDependencies = async (
  deps: string[],
): Promise<{ valid: string[]; rejected: string[] }> => {
  if (deps.length === 0) return { valid: [], rejected: [] };

  const bundled = new Set(Object.keys(TEMPLATE_PACKAGE_DEPENDENCIES));
  const valid: string[] = [];
  const rejected: string[] = [];

  for (const dep of deps) {
    const name = dep.replace(/@[\^~]?\d.*$/, "").trim();

    if (!name || name.length < 2) {
      rejected.push(dep);
      continue;
    }

    // Already in template
    if (bundled.has(name)) {
      continue;
    }

    // Known safe — skip registry check
    if (SAFE_EXTRA_DEPENDENCIES.has(name)) {
      valid.push(dep);
      continue;
    }

    // Check npm registry
    const exists = await checkNpmPackageExists(name);
    if (exists) {
      valid.push(dep);
    } else {
      console.warn(`[DepValidator] Package not found on npm: ${dep}`);
      rejected.push(dep);
    }
  }

  return { valid, rejected };
};
