import { View, Platform } from "react-native";
import type { ReactNode } from "react";

interface NeonBackgroundProps {
  children: ReactNode;
  intensity?: "subtle" | "medium" | "vivid";
}

const GRADIENT_STYLES = {
  subtle: {
    backgroundImage:
      "linear-gradient(135deg, #0D0D1A 0%, #12121F 25%, #0A0A0A 50%, #0D0D1A 75%, #12121F 100%)",
    backgroundSize: "200% 200%",
  },
  medium: {
    backgroundImage:
      "linear-gradient(135deg, #0A0A0A 0%, rgba(0,229,255,0.08) 25%, #0D0D1A 50%, rgba(255,215,0,0.06) 75%, #0A0A0A 100%)",
    backgroundSize: "200% 200%",
  },
  vivid: {
    backgroundImage:
      "linear-gradient(135deg, #0A0A0A 0%, rgba(0,229,255,0.15) 25%, rgba(124,77,255,0.12) 50%, rgba(255,215,0,0.1) 75%, #0A0A0A 100%)",
    backgroundSize: "200% 200%",
  },
};

const NeonBackground = ({
  children,
  intensity = "medium",
}: NeonBackgroundProps) => {
  if (Platform.OS !== "web") {
    return (
      <View style={{ flex: 1, backgroundColor: "#0A0A0A" }}>{children}</View>
    );
  }

  const gradientStyle = GRADIENT_STYLES[intensity];

  return (
    <View style={{ flex: 1, position: "relative" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          ...gradientStyle,
          animation: "neonDrift 12s ease-in-out infinite",
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.03,
          backgroundImage:
            'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAE0lEQVQI12P4z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=")',
          backgroundSize: "64px 64px",
          zIndex: 1,
        }}
      />
      <View style={{ flex: 1, zIndex: 2, position: "relative" }}>
        {children}
      </View>
    </View>
  );
};

export default NeonBackground;
