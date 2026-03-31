import type { Agent } from '../types';
import { AGENT_HEAD_RADIUS, AGENT_BODY_HEIGHT, AGENT_LEG_LENGTH } from '../constants';

const drawStickFigure = (ctx: CanvasRenderingContext2D, agent: Agent): void => {
  const { x, y, color, direction, currentState, bobPhase } = agent;

  const bob = currentState === 'idle' ? Math.sin(bobPhase) * 1.5 : 0;
  const squash = currentState === 'landing' ? 0.7 : 1;

  const headY = y - AGENT_LEG_LENGTH * squash - AGENT_BODY_HEIGHT * squash - AGENT_HEAD_RADIUS + bob;
  const neckY = headY + AGENT_HEAD_RADIUS;
  const hipY = neckY + AGENT_BODY_HEIGHT * squash;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Shadow
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 10 * (currentState === 'jumping' ? 0.5 : 1), 3, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fill();

  // Legs
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;

  const walkCycle = currentState === 'walking' ? Math.sin(bobPhase * 3) * 0.4 : 0;
  const jumpSpread = currentState === 'jumping' ? -0.2 : 0;
  const landSpread = currentState === 'landing' ? 0.5 : 0;

  const legAngle1 = 0.25 + walkCycle + jumpSpread + landSpread;
  const legAngle2 = 0.25 - walkCycle + jumpSpread + landSpread;

  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(x - Math.sin(legAngle1) * AGENT_LEG_LENGTH, hipY + Math.cos(legAngle1) * AGENT_LEG_LENGTH * squash);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(x + Math.sin(legAngle2) * AGENT_LEG_LENGTH, hipY + Math.cos(legAngle2) * AGENT_LEG_LENGTH * squash);
  ctx.stroke();

  // Body
  ctx.beginPath();
  ctx.moveTo(x, neckY);
  ctx.lineTo(x, hipY);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Arms
  ctx.lineWidth = 2;
  const armWave = currentState === 'walking' ? Math.sin(bobPhase * 3 + Math.PI) * 0.3 : 0;
  const thinkArm = currentState === 'thinking' ? -0.8 : 0;
  const armMidY = neckY + AGENT_BODY_HEIGHT * 0.35 * squash;

  ctx.beginPath();
  ctx.moveTo(x, armMidY);
  ctx.lineTo(x - 8 - armWave * 5, armMidY + 8 + thinkArm * 5);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, armMidY);
  ctx.lineTo(x + 8 + armWave * 5, armMidY + 8);
  ctx.stroke();

  // Head
  ctx.beginPath();
  ctx.arc(x, headY, AGENT_HEAD_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Eye
  ctx.beginPath();
  ctx.arc(x + direction * 3, headY - 1, 1.8, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  // Thinking bubble
  if (currentState === 'thinking' || currentState === 'interacting') {
    const bubbleX = x + direction * 20;
    const bubbleY = headY - 18;

    ctx.beginPath();
    ctx.arc(x + direction * 8, headY - 10, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x + direction * 13, headY - 14, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(bubbleX, bubbleY, 16, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#333';
    ctx.font = '8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('...', bubbleX, bubbleY + 3);
  }
};

export const drawAgentLabel = (ctx: CanvasRenderingContext2D, agent: Agent): void => {
  const { x, y, name, role, color, statusText } = agent;
  const labelY = y - AGENT_LEG_LENGTH - AGENT_BODY_HEIGHT - AGENT_HEAD_RADIUS * 2 - 14;

  ctx.textAlign = 'center';

  // Name
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(name, x, labelY);

  // Role badge
  ctx.font = '8px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillText(role, x, labelY + 11);

  // Status text
  if (statusText) {
    ctx.font = 'italic 9px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(statusText, x, y + 18);
  }
};

export const drawAgent = (ctx: CanvasRenderingContext2D, agent: Agent, showLabels: boolean): void => {
  drawStickFigure(ctx, agent);
  if (showLabels) {
    drawAgentLabel(ctx, agent);
  }
};
