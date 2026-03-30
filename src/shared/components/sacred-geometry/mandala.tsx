import { useEffect } from "react";
import Svg, { Circle, Line, G } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

interface MandalaProps {
  size?: number;
  color?: string;
  spinning?: boolean;
}

const AnimatedView = Animated.View;

const Mandala = ({
  size = 200,
  color = "#ffd700",
  spinning = true,
}: MandalaProps) => {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (!spinning) return;
    rotation.value = withRepeat(
      withTiming(360, { duration: 20000, easing: Easing.linear }),
      -1,
      false
    );
  }, [spinning, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const cx = size / 2;
  const cy = size / 2;
  const layers = 3;

  return (
    <AnimatedView style={animatedStyle}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {Array.from({ length: layers }, (_, layer) => {
          const r = ((layer + 1) / layers) * (size / 2 - 10);
          const petals = 6 + layer * 6;

          return (
            <G key={layer}>
              <Circle
                cx={cx}
                cy={cy}
                r={r}
                stroke={color}
                strokeWidth={0.5}
                fill="none"
                opacity={0.3 + layer * 0.2}
              />
              {Array.from({ length: petals }, (_, i) => {
                const angle = ((2 * Math.PI) / petals) * i;
                const x1 = cx + (r - 10) * Math.cos(angle);
                const y1 = cy + (r - 10) * Math.sin(angle);
                const x2 = cx + r * Math.cos(angle);
                const y2 = cy + r * Math.sin(angle);
                return (
                  <Line
                    key={`${layer}-${i}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={color}
                    strokeWidth={1}
                    opacity={0.4 + layer * 0.15}
                  />
                );
              })}
            </G>
          );
        })}
        <Circle cx={cx} cy={cy} r={4} fill={color} opacity={0.8} />
      </Svg>
    </AnimatedView>
  );
};

export default Mandala;
