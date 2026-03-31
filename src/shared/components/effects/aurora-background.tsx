import { View, Platform } from "react-native";
import type { ReactNode } from "react";

interface AuroraBackgroundProps {
  children: ReactNode;
  intensity?: "subtle" | "medium" | "vivid";
}

const GRADIENT_STYLES = {
  subtle: {
    backgroundImage: "linear-gradient(135deg, #E8F0FF 0%, #F5E6FF 25%, #E6FFF5 50%, #FFF0E6 75%, #E8F0FF 100%)",
    backgroundSize: "400% 400%",
  },
  medium: {
    backgroundImage: "linear-gradient(135deg, #C5E8FF 0%, #E0C5FF 20%, #C5FFE8 40%, #FFC5E8 60%, #C5E8FF 80%, #FFE8C5 100%)",
    backgroundSize: "400% 400%",
  },
  vivid: {
    backgroundImage: "linear-gradient(135deg, #80F0FF 0%, #FF80CC 20%, #80FFB0 40%, #B388FF 60%, #80F0FF 80%, #FFD700 100%)",
    backgroundSize: "400% 400%",
  },
};

const AuroraBackground = ({
  children,
  intensity = "medium",
}: AuroraBackgroundProps) => {
  if (Platform.OS !== "web") {
    return (
      <View style={{ flex: 1, backgroundColor: "#F0F0FF" }}>{children}</View>
    );
  }

  const gradientStyle = GRADIENT_STYLES[intensity];

  return (
    <View style={{ flex: 1, position: "relative" }}>
      {/* Aurora gradient layer */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          ...gradientStyle,
          animation: "aurora 12s ease-in-out infinite",
          zIndex: 0,
        }}
      />
      {/* Noise texture overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.03,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundSize: "128px 128px",
          zIndex: 1,
        }}
      />
      {/* Content */}
      <View style={{ flex: 1, zIndex: 2, position: "relative" }}>
        {children}
      </View>
    </View>
  );
};

export default AuroraBackground;
