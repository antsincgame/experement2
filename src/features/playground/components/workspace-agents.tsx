import { useRef, useEffect, useCallback, useState } from 'react';
import { View, Platform } from 'react-native';
import { useProjectStore, type AppStatus } from '@/stores/project-store';

import type { Agent, SimulationState, AgentState } from '../types';
import { ROLE_CONFIGS, GROUND_OFFSET } from '../constants';
import { tick } from '../simulation/simulation-loop';

const MINI_SCALE = 0.65;
const STRIP_HEIGHT = 50;
const MINI_GROUND_OFFSET = 12;
const HEAD_R = 5;
const BODY_H = 9;
const LEG_L = 7;

const CHARS = 'アイウエオカキクケコ01';

const STATUS_REACTIONS: Record<AppStatus, { states: AgentState[]; excitement: number }> = {
  idle: { states: ['idle'], excitement: 0 },
  planning: { states: ['thinking'], excitement: 0.3 },
  scaffolding: { states: ['walking'], excitement: 0.5 },
  generating: { states: ['walking', 'thinking'], excitement: 0.8 },
  building: { states: ['walking'], excitement: 0.6 },
  analyzing: { states: ['thinking'], excitement: 0.4 },
  validating: { states: ['thinking', 'walking'], excitement: 0.5 },
  ready: { states: ['idle'], excitement: 0.1 },
  error: { states: ['idle'], excitement: 0 },
};

const MINI_AGENTS = [
  { id: 'w-planner', name: 'P', role: 'planner' as const, color: ROLE_CONFIGS.planner.color },
  { id: 'w-coder1', name: 'C1', role: 'coder' as const, color: ROLE_CONFIGS.coder.color },
  { id: 'w-coder2', name: 'C2', role: 'coder' as const, color: ROLE_CONFIGS.coder.color },
  { id: 'w-tester', name: 'T', role: 'tester' as const, color: ROLE_CONFIGS.tester.color },
  { id: 'w-reviewer', name: 'R', role: 'reviewer' as const, color: ROLE_CONFIGS.reviewer.color },
];

const createMiniAgent = (template: typeof MINI_AGENTS[number], sceneWidth: number, groundY: number): Agent => ({
  ...template,
  x: 20 + Math.random() * (sceneWidth - 40),
  y: groundY,
  vx: 0,
  vy: 0,
  direction: Math.random() > 0.5 ? 1 : -1,
  grounded: true,
  currentState: 'idle',
  stateTimer: 500 + Math.random() * 2000,
  energy: 80,
  targetX: null,
  statusText: '',
  bobPhase: Math.random() * Math.PI * 2,
});

const drawMiniAgent = (ctx: CanvasRenderingContext2D, agent: Agent): void => {
  const { x, y, color, direction, currentState, bobPhase } = agent;
  const bob = currentState === 'idle' ? Math.sin(bobPhase) * 1 : 0;
  const squash = currentState === 'landing' ? 0.75 : 1;

  const headY = y - LEG_L * squash - BODY_H * squash - HEAD_R + bob;
  const neckY = headY + HEAD_R;
  const hipY = neckY + BODY_H * squash;

  ctx.lineCap = 'round';

  // Shadow
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 6, 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fill();

  // Legs
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  const walkCycle = currentState === 'walking' ? Math.sin(bobPhase * 3) * 0.4 : 0;

  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(x - Math.sin(0.25 + walkCycle) * LEG_L, hipY + Math.cos(0.25 + walkCycle) * LEG_L * squash);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(x + Math.sin(0.25 - walkCycle) * LEG_L, hipY + Math.cos(0.25 - walkCycle) * LEG_L * squash);
  ctx.stroke();

  // Body
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, neckY);
  ctx.lineTo(x, hipY);
  ctx.stroke();

  // Arms
  ctx.lineWidth = 1.5;
  const armWave = currentState === 'walking' ? Math.sin(bobPhase * 3 + Math.PI) * 0.3 : 0;
  const armMidY = neckY + BODY_H * 0.35 * squash;

  ctx.beginPath();
  ctx.moveTo(x, armMidY);
  ctx.lineTo(x - 5 - armWave * 3, armMidY + 5);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, armMidY);
  ctx.lineTo(x + 5 + armWave * 3, armMidY + 5);
  ctx.stroke();

  // Head
  ctx.beginPath();
  ctx.arc(x, headY, HEAD_R, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Eye
  ctx.beginPath();
  ctx.arc(x + direction * 2, headY - 0.5, 1, 0, Math.PI * 2);
  ctx.fillStyle = '#FFF';
  ctx.fill();

  // Thinking bubble
  if (currentState === 'thinking') {
    ctx.beginPath();
    ctx.arc(x + direction * 10, headY - 8, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill();

    ctx.font = '5px monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(CHARS[Math.floor(bobPhase) % CHARS.length], x + direction * 10, headY - 6.5);
  }
};

const WorkspaceAgents = () => {
  const status = useProjectStore((s) => s.status);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<SimulationState>({
    agents: [],
    paused: false,
    groundY: 0,
    sceneWidth: 0,
    sceneHeight: STRIP_HEIGHT,
    time: 0,
  });
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);
  const statusRef = useRef<AppStatus>(status);
  statusRef.current = status;
  const containerIdRef = useRef(`ws-agents-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const container = document.getElementById(containerIdRef.current);
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = `${STRIP_HEIGHT}px`;
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const setup = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = rect.width;
      canvas.width = w * dpr;
      canvas.height = STRIP_HEIGHT * dpr;
      canvas.style.width = `${w}px`;

      const groundY = STRIP_HEIGHT - MINI_GROUND_OFFSET;
      const sim = simRef.current;
      sim.sceneWidth = w;
      sim.sceneHeight = STRIP_HEIGHT;
      sim.groundY = groundY;

      if (sim.agents.length === 0) {
        sim.agents = MINI_AGENTS.map((t) => createMiniAgent(t, w, groundY));
      }
    };

    setup();

    const loop = (timestamp: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = timestamp;
      const dt = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      const sim = simRef.current;
      const currentStatus = statusRef.current;
      const reaction = STATUS_REACTIONS[currentStatus];

      // React to app status
      for (const agent of sim.agents) {
        if (agent.currentState === 'idle' && agent.stateTimer <= 0 && reaction.excitement > 0) {
          const roll = Math.random();
          if (roll < reaction.excitement * 0.3) {
            const preferred = reaction.states[Math.floor(Math.random() * reaction.states.length)];
            if (preferred === 'walking') {
              agent.currentState = 'walking';
              agent.targetX = 20 + Math.random() * (sim.sceneWidth - 40);
              agent.direction = agent.targetX > agent.x ? 1 : -1;
              agent.stateTimer = 3000;
            } else if (preferred === 'thinking') {
              agent.currentState = 'thinking';
              agent.stateTimer = 1500 + Math.random() * 1500;
              agent.vx = 0;
            }
          }
        }

        // Error state: everyone stops
        if (currentStatus === 'error' && agent.currentState === 'walking') {
          agent.currentState = 'idle';
          agent.vx = 0;
          agent.stateTimer = 2000;
        }

        // Ready celebration: random jumps
        if (currentStatus === 'ready' && agent.grounded && Math.random() < 0.002) {
          agent.currentState = 'jumping';
          agent.vy = -7;
          agent.grounded = false;
        }
      }

      tick(sim, dt);

      const ctx = canvas.getContext('2d');
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, sim.sceneWidth, STRIP_HEIGHT);

        // Ground line
        ctx.beginPath();
        ctx.moveTo(0, sim.groundY + 1);
        ctx.lineTo(sim.sceneWidth, sim.groundY + 1);
        ctx.strokeStyle = currentStatus === 'error'
          ? 'rgba(255, 51, 102, 0.2)'
          : currentStatus === 'ready'
            ? 'rgba(0, 255, 136, 0.2)'
            : 'rgba(0, 229, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        for (const agent of sim.agents) {
          drawMiniAgent(ctx, agent);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    const resizeObserver = new ResizeObserver(() => setup());
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      canvasRef.current = null;
    };
  }, []);

  if (Platform.OS !== 'web') return null;

  return (
    <View
      nativeID={containerIdRef.current}
      style={{
        height: STRIP_HEIGHT,
        backgroundColor: 'rgba(11, 13, 23, 0.6)',
        borderTopWidth: 1,
        borderTopColor: 'rgba(0, 229, 255, 0.1)',
      }}
    />
  );
};

export default WorkspaceAgents;
