import type { Agent, SimulationState } from '../types';
import {
  GRAVITY,
  GROUND_FRICTION,
  AGENT_HEAD_RADIUS,
  SEPARATION_DISTANCE,
  SEPARATION_FORCE,
} from '../constants';

export const applyGravity = (agent: Agent, groundY: number): void => {
  if (agent.grounded) return;

  agent.vy += GRAVITY;
  agent.y += agent.vy;

  if (agent.y >= groundY) {
    agent.y = groundY;
    agent.vy = 0;
    agent.grounded = true;

    if (agent.currentState === 'jumping') {
      agent.currentState = 'landing';
      agent.stateTimer = 200;
    }
  }
};

export const applyMovement = (agent: Agent, sceneWidth: number): void => {
  agent.x += agent.vx;
  agent.vx *= GROUND_FRICTION;

  if (Math.abs(agent.vx) < 0.05) {
    agent.vx = 0;
  }

  const margin = AGENT_HEAD_RADIUS + 4;
  if (agent.x < margin) {
    agent.x = margin;
    agent.vx = Math.abs(agent.vx) * 0.5;
    agent.direction = 1;
  } else if (agent.x > sceneWidth - margin) {
    agent.x = sceneWidth - margin;
    agent.vx = -Math.abs(agent.vx) * 0.5;
    agent.direction = -1;
  }
};

export const applySeparation = (agents: Agent[]): void => {
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const a = agents[i];
      const b = agents[j];
      const dx = b.x - a.x;
      const dist = Math.abs(dx);

      if (dist < SEPARATION_DISTANCE && dist > 0) {
        const push = (SEPARATION_DISTANCE - dist) * SEPARATION_FORCE * 0.5;
        const sign = dx > 0 ? 1 : -1;
        a.vx -= sign * push;
        b.vx += sign * push;
      }
    }
  }
};

export const applyPhysics = (agent: Agent, state: SimulationState): void => {
  applyGravity(agent, state.groundY);
  applyMovement(agent, state.sceneWidth);
};
