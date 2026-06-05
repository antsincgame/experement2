import {
  EXPO_SDK_EXTRA_PINS,
  SAFE_EXTRA_DEPENDENCIES,
  TEMPLATE_PACKAGE_DEPENDENCIES,
} from "./generation-contract.js";
import { warnCaught } from "./catch-log.js";

const REGISTRY_TIMEOUT_MS = 5000;

// npm package naming rules: optional @scope/, lowercase-ish, no leading dash.
// Rejecting non-matching names BEFORE the registry check blocks CLI-flag
// injection (e.g. "--save-dev", "--registry=...") into `npm install`.
const VALID_PACKAGE_NAME = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

const UNSAFE_SPEC_CHARS = /[;&|`$()<>\s]/;

/** Pin safe Expo modules to the template SDK so v56 stubs do not break web Metro. */
export const pinExtraDependencyForSdk = (dep: string): string => {
  const name = extractPackageName(dep);
  if (!name) {
    return dep;
  }
  const pin = EXPO_SDK_EXTRA_PINS[name];
  if (!pin) {
    return dep;
  }
  const versionAt = name.startsWith("@") ? dep.indexOf("@", 1) : dep.indexOf("@");
  if (versionAt === -1) {
    return `${name}@${pin}`;
  }
  const version = dep.slice(versionAt + 1);
  if (/^(\^|~)?56\./.test(version)) {
    return `${name}@${pin}`;
  }
  return dep;
};

const extractPackageName = (dep: string): string | null => {
  const trimmed = dep.trim();
  if (!trimmed || UNSAFE_SPEC_CHARS.test(trimmed)) {
    return null;
  }

  if (trimmed.startsWith("@")) {
    const slashIdx = trimmed.indexOf("/");
    if (slashIdx === -1) {
      return null;
    }
    const versionAt = trimmed.indexOf("@", slashIdx + 1);
    return versionAt === -1 ? trimmed : trimmed.slice(0, versionAt);
  }

  const versionAt = trimmed.indexOf("@");
  return versionAt === -1 ? trimmed : trimmed.slice(0, versionAt);
};

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
  } catch (error) {
    warnCaught("dependency-validator", error, `check npm package ${packageName}`);
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
    const name = extractPackageName(dep);

    if (!name || name.length < 2 || name.length > 214 || !VALID_PACKAGE_NAME.test(name)) {
      rejected.push(dep);
      continue;
    }

    // Already in template
    if (bundled.has(name)) {
      continue;
    }

    // Known safe — skip registry check
    if (SAFE_EXTRA_DEPENDENCIES.has(name)) {
      valid.push(pinExtraDependencyForSdk(dep));
      continue;
    }

    // Check npm registry
    const exists = await checkNpmPackageExists(name);
    if (exists) {
      valid.push(pinExtraDependencyForSdk(dep));
    } else {
      console.warn(`[DepValidator] Package not found on npm: ${dep}`);
      rejected.push(dep);
    }
  }

  return { valid, rejected };
};
