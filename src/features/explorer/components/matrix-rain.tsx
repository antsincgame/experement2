import { useEffect, useRef } from 'react';
import { View, Platform } from 'react-native';

const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFabcdef{}[]()<>;:=/\\|+-*&^%$#@!~';
const FONT_SIZE = 14;
const FADE_ALPHA = 0.05;
const COLOR_HEAD = '#FFFFFF';
const COLOR_BODY = '#00FF41';
const DROP_SPEED_MIN = 0.3;
const DROP_SPEED_MAX = 1.2;

interface Drop {
  x: number;
  y: number;
  speed: number;
  chars: string[];
  length: number;
}

const MatrixRain = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dropsRef = useRef<Drop[]>([]);
  const rafRef = useRef(0);
  const containerIdRef = useRef(`matrix-rain-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const container = document.getElementById(containerIdRef.current);
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const initDrops = (cols: number, rows: number): Drop[] => {
      const drops: Drop[] = [];
      for (let i = 0; i < cols; i++) {
        const length = 5 + Math.floor(Math.random() * 20);
        const chars: string[] = [];
        for (let j = 0; j < length; j++) {
          chars.push(CHARS[Math.floor(Math.random() * CHARS.length)]);
        }
        drops.push({
          x: i,
          y: Math.random() * -rows,
          speed: DROP_SPEED_MIN + Math.random() * (DROP_SPEED_MAX - DROP_SPEED_MIN),
          chars,
          length,
        });
      }
      return drops;
    };

    const setupCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const cols = Math.floor(rect.width / FONT_SIZE);
      const rows = Math.floor(rect.height / FONT_SIZE);
      dropsRef.current = initDrops(cols, rows);
    };

    setupCanvas();

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Fade previous frame
      ctx.fillStyle = `rgba(9, 9, 11, ${FADE_ALPHA})`;
      ctx.fillRect(0, 0, w, h);

      ctx.font = `${FONT_SIZE}px "JetBrains Mono", "Fira Code", monospace`;

      const rows = Math.floor(h / FONT_SIZE);

      for (const drop of dropsRef.current) {
        const headRow = Math.floor(drop.y);

        for (let t = 0; t < drop.length; t++) {
          const row = headRow - t;
          if (row < 0 || row >= rows) continue;

          const py = row * FONT_SIZE + FONT_SIZE;
          const px = drop.x * FONT_SIZE;

          if (t === 0) {
            ctx.fillStyle = COLOR_HEAD;
            ctx.globalAlpha = 1;
          } else {
            ctx.fillStyle = COLOR_BODY;
            ctx.globalAlpha = Math.max(0.1, 1 - t / drop.length);
          }

          // Randomly mutate chars in trail
          if (Math.random() < 0.02) {
            drop.chars[t] = CHARS[Math.floor(Math.random() * CHARS.length)];
          }

          ctx.fillText(drop.chars[t], px, py);
        }

        ctx.globalAlpha = 1;

        drop.y += drop.speed;

        if ((drop.y - drop.length) * FONT_SIZE > h) {
          drop.y = Math.random() * -15;
          drop.speed = DROP_SPEED_MIN + Math.random() * (DROP_SPEED_MAX - DROP_SPEED_MIN);
          drop.length = 5 + Math.floor(Math.random() * 20);
          const newChars: string[] = [];
          for (let j = 0; j < drop.length; j++) {
            newChars.push(CHARS[Math.floor(Math.random() * CHARS.length)]);
          }
          drop.chars = newChars;
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    // Initial clear
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#09090B';
      ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    }

    rafRef.current = requestAnimationFrame(draw);

    const resizeObserver = new ResizeObserver(() => {
      setupCanvas();
      // Re-clear on resize
      const c = canvas.getContext('2d');
      if (c) {
        const dpr = window.devicePixelRatio || 1;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.fillStyle = '#09090B';
        c.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      }
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
      canvasRef.current = null;
    };
  }, []);

  if (Platform.OS !== 'web') return null;

  return (
    <View
      nativeID={containerIdRef.current}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
      }}
      pointerEvents="none"
    />
  );
};

export default MatrixRain;
