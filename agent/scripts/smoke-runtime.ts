// CI smoke: tsx must expose plan-brief wrappers as functions (not eager undefined snapshots).
const loadHelpers = async (): Promise<void> => {
  await import("../src/lib/pipeline-helpers.js");
};

const assertPlanBrief = async (label: string): Promise<void> => {
  const { formatPlanBriefForModels } = await import("../src/lib/plan-brief.js");
  if (typeof formatPlanBriefForModels !== "function") {
    console.error(`smoke [${label}]: formatPlanBriefForModels is not a function`);
    process.exit(1);
  }
  formatPlanBriefForModels({
    name: "smoke",
    displayName: "Smoke",
    description: "Runtime smoke.",
    files: [{ path: "app/index.tsx", type: "screen", description: "Home." }],
  });
};

await assertPlanBrief("direct");
await loadHelpers();
await assertPlanBrief("after-pipeline-helpers");

console.log("smoke:ok");
