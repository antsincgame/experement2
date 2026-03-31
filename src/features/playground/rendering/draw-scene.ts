import type { SimulationState } from '../types';
import { drawAgent } from './draw-agent';

const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number, groundY: number): void => {
  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
  skyGrad.addColorStop(0, '#E8F0FE');
  skyGrad.addColorStop(0.6, '#F0F0FF');
  skyGrad.addColorStop(1, '#F5F5FF');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, groundY);

  // Ground area
  const groundGrad = ctx.createLinearGradient(0, groundY, 0, height);
  groundGrad.addColorStop(0, '#E2E8F0');
  groundGrad.addColorStop(1, '#D4DAE4');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, groundY, width, height - groundY);

  // Ground line
  ctx.beginPath();
  ctx.moveTo(0, groundY + 2);
  ctx.lineTo(width, groundY + 2);
  ctx.strokeStyle = 'rgba(124, 77, 255, 0.15)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Subtle grid dots on ground
  ctx.fillStyle = 'rgba(124, 77, 255, 0.06)';
  for (let gx = 30; gx < width; gx += 40) {
    for (let gy = groundY + 15; gy < height; gy += 20) {
      ctx.beginPath();
      ctx.arc(gx, gy, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

export const drawScene = (
  ctx: CanvasRenderingContext2D,
  state: SimulationState,
  showLabels: boolean,
): void => {
  const { sceneWidth, sceneHeight, groundY, agents } = state;

  ctx.clearRect(0, 0, sceneWidth, sceneHeight);
  drawBackground(ctx, sceneWidth, sceneHeight, groundY);

  // Sort agents by y for depth (higher y = closer = drawn last)
  const sorted = [...agents].sort((a, b) => a.y - b.y);

  for (const agent of sorted) {
    drawAgent(ctx, agent, showLabels);
  }

  // Paused overlay
  if (state.paused) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(0, 0, sceneWidth, sceneHeight);

    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', sceneWidth / 2, sceneHeight / 2);
  }
};
