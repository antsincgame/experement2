import { useEffect } from "react";
import Svg, { Path, Circle } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";

interface LotusProps {
  size?: number;
  color?: string;
  blooming?: boolean;
}

const AnimatedView = Animated.View;

const Lotus = ({
  size = 120,
  color = "#ffd700",
  blooming = false,
}: LotusProps) => {
  const scale = useSharedValue(blooming ? 0.3 : 1);
  const opacity = useSharedValue(blooming ? 0 : 1);

  useEffect(() => {
    if (blooming) {
      scale.value = withTiming(1, {
        duration: 2000,
        easing: Easing.out(Easing.cubic),
      });
      opacity.value = withTiming(1, { duration: 1500 });
    }
  }, [blooming, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const cx = size / 2;
  const cy = size / 2;
  const petalCount = 8;
  const r = size / 3;

  const petals = Array.from({ length: petalCount }, (_, i) => {
    const angle = ((2 * Math.PI) / petalCount) * i;
    const tipX = cx + r * Math.cos(angle);
    const tipY = cy + r * Math.sin(angle);
    const cp1Angle = angle - 0.3;
    const cp2Angle = angle + 0.3;
    const cpDist = r * 0.6;

    return `M ${cx} ${cy} Q ${cx + cpDist * Math.cos(cp1Angle)} ${cy + cpDist * Math.sin(cp1Angle)} ${tipX} ${tipY} Q ${cx + cpDist * Math.cos(cp2Angle)} ${cy + cpDist * Math.sin(cp2Angle)} ${cx} ${cy}`;
  });

  return (
    <AnimatedView style={animatedStyle}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {petals.map((d, i) => (
          <Path
            key={i}
            d={d}
            fill={color}
            opacity={0.15 + (i % 2) * 0.1}
            stroke={color}
            strokeWidth={0.5}
          />
        ))}
        <Circle cx={cx} cy={cy} r={6} fill={color} opacity={0.9} />
        <Circle cx={cx} cy={cy} r={3} fill="#0a0a0f" />
      </Svg>
    </AnimatedView>
  );
};

export default Lotus;
