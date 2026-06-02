// Per-project git operations behind one seam. Extracted verbatim from pipeline.ts
// so version control is readable in one place and mockable when the createProject
// orchestration gets integration coverage.
import { spawnSync } from "child_process";

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

export const gitCommit = (projectPath: string, message: string): string | null => {
  try {
    runGitCommand(projectPath, ["add", "-A"]);
    runGitCommand(projectPath, ["commit", "-m", message, "--allow-empty"]);
    return runGitCommand(projectPath, ["rev-parse", "--short", "HEAD"]);
  } catch {
    return null;
  }
};

export const gitInit = (projectPath: string): void => {
  try {
    runGitCommand(projectPath, ["init"]);
    // Set local git identity so commit works even without global config
    runGitCommand(projectPath, ["config", "user.email", "agent@appfactory.local"]);
    runGitCommand(projectPath, ["config", "user.name", "App Factory Agent"]);
    runGitCommand(projectPath, ["add", "-A"]);
    runGitCommand(projectPath, ["commit", "-m", "v1: initial generation"]);
  } catch (err) {
    console.warn("[Pipeline] git init failed:", err);
  }
};

export const getVersionNumber = (projectPath: string): number => {
  try {
    const log = runGitCommand(projectPath, ["log", "--oneline"], {
      allowFailure: true,
    });
    return log ? log.split("\n").length + 1 : 1;
  } catch {
    return 1;
  }
};
