import { useEffect, useRef, useState } from "react";
import { View, Text, Animated } from "react-native";
import { CheckCircle2 } from "lucide-react-native";
import Lotus from "../sacred-geometry/lotus";

interface LotusToastProps {
  visible: boolean;
  onHide: () => void;
}

const LotusToast = ({ visible, onHide }: LotusToastProps) => {
  const [opacity] = useState(new Animated.Value(0));
  const onHideRef = useRef(onHide);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  onHideRef.current = onHide;

  useEffect(() => {
    if (!visible) {
      animationRef.current?.stop();
      animationRef.current = null;
      opacity.setValue(0);
      return;
    }

    let cancelled = false;
    const animation = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]);

    animationRef.current = animation;
    animation.start(() => {
      if (!cancelled) {
        onHideRef.current();
      }
    });

    return () => {
      cancelled = true;
      animation.stop();
      animationRef.current = null;
    };
  }, [visible, opacity]);

  if (!visible) return null;

  return (
    <Animated.View
      style={{
        position: "absolute",
        bottom: 24,
        right: 24,
        opacity,
        zIndex: 999,
      }}
    >
      <View
        className="flex-row items-center gap-3 px-4 py-3 rounded-2xl"
        style={{
          backgroundColor: "rgba(18, 18, 31, 0.9)",
          borderWidth: 1,
          borderColor: "rgba(0, 255, 136, 0.3)",
          shadowColor: "#00FF88",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 16,
        }}
      >
        <Lotus size={28} color="#FFD700" blooming />
        <View>
          <View className="flex-row items-center gap-1.5">
            <CheckCircle2 size={13} color="#00FF88" strokeWidth={2} />
            <Text className="text-white text-xs font-semibold">Build Successful</Text>
          </View>
          <Text className="text-ink-faint text-[10px] mt-0.5">App is ready in preview</Text>
        </View>
      </View>
    </Animated.View>
  );
};

export default LotusToast;
