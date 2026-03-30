import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

interface FlowerOfLifeProps {
  size?: number;
  opacity?: number;
  color?: string;
}

const FlowerOfLife = ({
  size = 400,
  opacity = 0.04,
  color = "#00f0ff",
}: FlowerOfLifeProps) => {
  const r = size / 6;
  const cx = size / 2;
  const cy = size / 2;

  const circles: Array<{ x: number; y: number }> = [{ x: cx, y: cy }];

  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    circles.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }

  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    circles.push({
      x: cx + 2 * r * Math.cos(angle),
      y: cy + 2 * r * Math.sin(angle),
    });
    const midAngle = (Math.PI / 3) * i + Math.PI / 6;
    circles.push({
      x: cx + r * Math.sqrt(3) * Math.cos(midAngle),
      y: cy + r * Math.sqrt(3) * Math.sin(midAngle),
    });
  }

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ position: "absolute", opacity }}
    >
      <Defs>
        <RadialGradient id="flowerGrad" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <Stop offset="100%" stopColor={color} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      {circles.map((c, i) => (
        <Circle
          key={i}
          cx={c.x}
          cy={c.y}
          r={r}
          stroke={color}
          strokeWidth={0.5}
          fill="none"
        />
      ))}
    </Svg>
  );
};

export default FlowerOfLife;
