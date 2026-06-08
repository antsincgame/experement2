import { describe, expect, it } from "vitest";
import { scoreProjectQuality, type QualityScoreInput } from "./quality-score.js";

const GOOD_SCREEN = [
  'import { YStack, Text, Spinner, Icon } from "@/ui";',
  "export default function Home() {",
  "  if (loading) return <Spinner />;",
  "  return <YStack><Text>No items yet</Text></YStack>;",
  "}",
  "// EOF",
].join("\n");

const GOOD_STORE = [
  'import { create } from "zustand";',
  "export const useStore = create(() => ({ items: [] }));",
  "// EOF",
].join("\n");

const base = (over: Partial<QualityScoreInput>): QualityScoreInput => ({
  files: ["app/(tabs)/index.tsx", "src/stores/store.ts"],
  readFile: (f) => (f.includes("index") ? GOOD_SCREEN : GOOD_STORE),
  typeErrorCount: 0,
  contractViolationCount: 0,
  webExportOk: true,
  ...over,
});

describe("scoreProjectQuality", () => {
  it("gives a clean, idiomatic, stateful project a high score", () => {
    const { score, axes } = scoreProjectQuality(base({}));
    expect(score).toBeGreaterThanOrEqual(90);
    expect(axes.typecheck).toBe(100);
    expect(axes.contracts).toBe(100);
    expect(axes.states).toBe(100);
    expect(axes.idiomatic).toBe(100);
  });

  it("is MONOTONIC in type errors (more errors ⇒ strictly lower score)", () => {
    const s0 = scoreProjectQuality(base({ typeErrorCount: 0 })).score;
    const s1 = scoreProjectQuality(base({ typeErrorCount: 1 })).score;
    const s3 = scoreProjectQuality(base({ typeErrorCount: 3 })).score;
    expect(s0).toBeGreaterThan(s1);
    expect(s1).toBeGreaterThan(s3);
  });

  it("is monotonic in contract violations", () => {
    const a = scoreProjectQuality(base({ contractViolationCount: 0 })).score;
    const b = scoreProjectQuality(base({ contractViolationCount: 2 })).score;
    expect(a).toBeGreaterThan(b);
  });

  it("lowers the states axis when a data screen has no empty/loading state", () => {
    const bareScreen = 'import { YStack } from "@/ui";\nexport default function S(){ return <YStack/>; }\n// EOF';
    const { axes } = scoreProjectQuality(
      base({ readFile: (f) => (f.includes("index") ? bareScreen : GOOD_STORE) }),
    );
    expect(axes.states).toBeLessThan(100);
  });

  it("lowers the idiomatic axis for react-native View/Text/StyleSheet imports", () => {
    const rnScreen = 'import { View, Text } from "react-native";\nexport default function S(){ return <View><Text>x</Text></View>; }\n// EOF';
    const { axes } = scoreProjectQuality(
      base({ readFile: (f) => (f.includes("index") ? rnScreen : GOOD_STORE) }),
    );
    expect(axes.idiomatic).toBeLessThan(100);
  });

  it("caps the score when web export failed", () => {
    const { score } = scoreProjectQuality(base({ webExportOk: false }));
    expect(score).toBeLessThanOrEqual(40);
  });

  it("penalizes empty/placeholder files in the completeness axis", () => {
    const { axes } = scoreProjectQuality(
      base({ readFile: (f) => (f.includes("index") ? "// EMPTY — awaiting retry\n" : GOOD_STORE) }),
    );
    expect(axes.completeness).toBeLessThan(100);
  });

  it("never throws on unreadable files", () => {
    expect(() =>
      scoreProjectQuality(base({ readFile: () => { throw new Error("io"); } })),
    ).not.toThrow();
  });
});
