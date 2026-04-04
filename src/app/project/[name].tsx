// Renders a thin project route while workspace orchestration lives in a dedicated controller hook.
import { useLocalSearchParams } from "expo-router";
import { ProjectScreenContent } from "@/features/workspace/components/project-screen-content";
import { useProjectScreenController } from "@/features/workspace/hooks/use-project-screen-controller";

export default function ProjectScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const controller = useProjectScreenController(name ?? null);
  return <ProjectScreenContent {...controller} />;
}
