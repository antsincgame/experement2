// Integration test: drive the whole createProject orchestration end-to-end —
// plan -> scaffold -> generate -> contract/type heal -> quality gates -> build
// loop -> preview — with a PipelineContext whose side-effecting members (model,
// scaffold, process ops, git, fetch, broadcast) are plain fakes. The pure logic
// (plan auto-heal, sanitization, static validation, contract checks) runs for
// real. No module mocking.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { getProjectPath, getWorkspaceRoot } from "../services/file-manager.js";
import type { CommandResult } from "../services/process-manager.js";
import { makeTempProjectName, removeTempProject } from "../test-support/temp-workspace.js";
import { streamOf } from "../test-support/llm-mock.js";
import { createProject, createDefaultContext, type PipelineContext } from "./pipeline.js";

const ok = (): CommandResult => ({ success: true, exitCode: 0, stdout: "", stderr: "", combinedOutput: "" });

describe("createProject (integration, injected PipelineContext)", () => {
  let slug: string;
  let events: Array<Record<string, unknown>>;
  let ctx: PipelineContext;

  beforeEach(() => {
    slug = makeTempProjectName("it-cp");
    events = [];

    const planJson = JSON.stringify({
      name: slug,
      displayName: "Test App",
      description: "a tiny test app",
      navigation: { type: "stack", screens: [] },
      files: [{ path: "app/index.tsx", type: "screen", description: "home", dependencies: [] }],
    });

    ctx = {
      ...createDefaultContext(),
      complete: async (messages) => {
        const user = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
        if (user.includes("Create an app plan for")) return streamOf(planJson);
        const fp = user.match(/Generate the complete code for:\s*(\S+)/)?.[1] ?? "x";
        return streamOf(`filepath: ${fp}\nexport default function Screen() { return null; }\n// EOF`);
      },
      createProjectFromCache: async (name, displayName) => {
        // Mirror the real scaffold (copy the committed template_cache + set app.json)
        // minus the npm install, so the real static validator sees a full project.
        const p = getProjectPath(name);
        fs.cpSync(path.join(getWorkspaceRoot(), "template_cache"), p, {
          recursive: true,
          // Skip node_modules/.git/etc: on a non-isolated machine template_cache
          // may contain a large installed node_modules, and the validator only
          // needs the source files + package.json.
          filter: (src) => !/[/\\](node_modules|\.git|\.expo|dist)([/\\]|$)/.test(src),
        });
        const appJsonPath = path.join(p, "app.json");
        const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
        appJson.expo.name = displayName;
        appJson.expo.slug = name;
        fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2));
        return p;
      },
      runTypecheck: async () => ok(),
      runWebExport: async () => ok(),
      runNativeSmoke: async () => ok(),
      npmInstall: async () => {},
      startExpo: async (_name, _projectPath, onLog) => {
        onLog({ type: "build_success", message: "build ok" });
        return { port: 8081, process: {} as unknown as import("child_process").ChildProcess };
      },
      runGitCommand: () => "",
      setPreviewPort: () => {},
      fetch: (async () => ({ ok: true })) as unknown as typeof fetch,
      broadcast: (msg) => {
        events.push(msg);
      },
    };
  });

  afterEach(() => removeTempProject(slug));

  it("plans, scaffolds, generates, passes the gates, and announces a ready preview", async () => {
    const result = await createProject({ description: "a tiny test app" }, ctx);

    expect(result.projectName).toBe(slug);
    expect(result.port).toBe(8081);
    expect(result.plan.name).toBe(slug);

    const types = events.map((e) => e.type);
    expect(types).toContain("preview_ready");
    expect(types).not.toContain("system_error");

    // The generated screen really landed on disk.
    expect(fs.existsSync(path.join(getProjectPath(slug), "app", "index.tsx"))).toBe(true);
  });
});
