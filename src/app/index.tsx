// Renders the thin welcome route after moving orchestration into a dedicated workspace controller hook.
import { HomeScreenContent } from "@/features/workspace/components/home-screen-content";
import { useHomeScreenController } from "@/features/workspace/hooks/use-home-screen-controller";

export default function AppFactoryScreen() {
  const controller = useHomeScreenController();
  return <HomeScreenContent {...controller} />;
}


