// Per-project git operations behind one seam. Extracted from pipeline.ts so
// version control is readable in one place. The high-level helpers accept an
// injectable `run` (defaulting to the real runGitCommand) so their logic can be
// tested deterministically without spawning git — plain function injection, no
// module mocking.
import { spawnSync } from "child_process";
import path from "path";

export const GIT_HASH_PATTERN = /^[a-f0-9]{7,64}$/i;

export const runGitCommand = (
  projectPath: string,
  args: string[],
  options: { allowFailure?: boolean } = {}
): string => {
  const result = spawnSync("git", args, {
    cwd: projectPath,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    // CRITICAL: never let git's repo discovery climb ABOVE the project directory.
    // A generated project without its own .git would otherwise resolve to the App
    // Factory repo itself, and `git add -A` there would commit the entire dev tree
    // (source edits + every workspace project) as bogus "version" commits.
    env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(projectPath) },
  });

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 1) !== 0 && !options.allowFailure) {
    const output = [result.stdout, result.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(output || `git ${args.join(" ")} failed`);
  }

  return result.stdout?.trim() ?? "";
};

type GitRunner = typeof runGitCommand;

/** True only when projectPath is itself a git repo root — never a parent repo. */
const isOwnGitRepo = (projectPath: string, run: GitRunner): boolean => {
  try {
    const top = run(projectPath, ["rev-parse", "--show-toplevel"], { allowFailure: true });
    if (!top) {
      return false;
    }
    const normalize = (p: string): string => path.resolve(p).replace(/\\/g, "/").toLowerCase();
    return normalize(top) === normalize(projectPath);
  } catch {
    return false;
  }
};

export const gitCommit = (
  projectPath: string,
  message: string,
  run: GitRunner = runGitCommand
): string | null => {
  try {
    // Guard against committing into a parent repo: if this project isn't its own
    // git root yet, initialize it first instead of polluting the App Factory repo.
    if (!isOwnGitRepo(projectPath, run)) {
      gitInit(projectPath, run);
    }
    run(projectPath, ["add", "-A"]);
    run(projectPath, ["commit", "-m", message, "--allow-empty"]);
    return run(projectPath, ["rev-parse", "--short", "HEAD"]);
  } catch {
    return null;
  }
};

export const gitInit = (
  projectPath: string,
  run: GitRunner = runGitCommand
): void => {
  try {
    run(projectPath, ["init"]);
    // Set local git identity so commit works even without global config
    run(projectPath, ["config", "user.email", "agent@appfactory.local"]);
    run(projectPath, ["config", "user.name", "App Factory Agent"]);
    run(projectPath, ["add", "-A"]);
    run(projectPath, ["commit", "-m", "v1: initial generation"]);
  } catch (err) {
    console.warn("[Pipeline] git init failed:", err);
  }
};

export const getVersionNumber = (
  projectPath: string,
  run: GitRunner = runGitCommand
): number => {
  try {
    const log = run(projectPath, ["log", "--oneline"], { allowFailure: true });
    return log ? log.split("\n").length + 1 : 1;
  } catch {
    return 1;
  }
};
