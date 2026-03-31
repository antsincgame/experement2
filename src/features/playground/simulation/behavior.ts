import type { Agent, SimulationState } from '../types';
import { ROLE_CONFIGS, JUMP_VELOCITY, MAX_WALK_SPEED } from '../constants';

const randomFromArray = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const findNearestOther = (agent: Agent, agents: Agent[]): Agent | null => {
  let nearest: Agent | null = null;
  let minDist = Infinity;

  for (const other of agents) {
    if (other.id === agent.id) continue;
    const dist = Math.abs(other.x - agent.x);
    if (dist < minDist) {
      minDist = dist;
      nearest = other;
    }
  }

  return minDist < 60 ? nearest : null;
};

const transitionToIdle = (agent: Agent): void => {
  agent.currentState = 'idle';
  agent.stateTimer = 800 + Math.random() * 2000;
  agent.statusText = '';
  agent.targetX = null;
};

const transitionToWalking = (agent: Agent, sceneWidth: number): void => {
  const config = ROLE_CONFIGS[agent.role];
  const range = config.wanderRange;
  const targetX = Math.max(20, Math.min(sceneWidth - 20, agent.x + (Math.random() - 0.5) * range * 2));

  agent.currentState = 'walking';
  agent.targetX = targetX;
  agent.direction = targetX > agent.x ? 1 : -1;
  agent.stateTimer = 5000;
  agent.statusText = '';
};

const transitionToThinking = (agent: Agent): void => {
  const config = ROLE_CONFIGS[agent.role];
  agent.currentState = 'thinking';
  agent.stateTimer = config.thinkDuration * (0.7 + Math.random() * 0.6);
  agent.statusText = randomFromArray(config.statusTexts);
  agent.vx = 0;
};

const transitionToJumping = (agent: Agent): void => {
  if (!agent.grounded) return;
  agent.currentState = 'jumping';
  agent.vy = JUMP_VELOCITY;
  agent.grounded = false;
  agent.statusText = '';
};

const updateIdle = (agent: Agent, state: SimulationState, dt: number): void => {
  agent.stateTimer -= dt;
  if (agent.stateTimer > 0) return;

  const config = ROLE_CONFIGS[agent.role];

  if (agent.role === 'reviewer') {
    const nearby = findNearestOther(agent, state.agents);
    if (nearby && Math.random() < 0.3) {
      agent.currentState = 'interacting';
      agent.stateTimer = 1500 + Math.random() * 1000;
      agent.statusText = randomFromArray(config.statusTexts);
      agent.targetX = nearby.x;
      agent.direction = nearby.x > agent.x ? 1 : -1;
      return;
    }
  }

  const roll = Math.random();
  if (roll < 0.15 && agent.grounded) {
    transitionToJumping(agent);
  } else if (roll < 0.40) {
    transitionToThinking(agent);
  } else {
    transitionToWalking(agent, state.sceneWidth);
  }
};

const updateWalking = (agent: Agent, dt: number): void => {
  agent.stateTimer -= dt;
  if (agent.targetX === null || agent.stateTimer <= 0) {
    transitionToIdle(agent);
    return;
  }

  const config = ROLE_CONFIGS[agent.role];
  const dx = agent.targetX - agent.x;

  if (Math.abs(dx) < 5) {
    transitionToIdle(agent);
    return;
  }

  const speed = config.baseSpeed * MAX_WALK_SPEED;
  agent.direction = dx > 0 ? 1 : -1;
  agent.vx = agent.direction * speed;
};

const updateThinking = (agent: Agent, dt: number): void => {
  agent.stateTimer -= dt;
  agent.vx = 0;
  if (agent.stateTimer <= 0) {
    transitionToIdle(agent);
  }
};

const updateLanding = (agent: Agent, dt: number): void => {
  agent.stateTimer -= dt;
  if (agent.stateTimer <= 0) {
    transitionToIdle(agent);
  }
};

const updateInteracting = (agent: Agent, state: SimulationState, dt: number): void => {
  agent.stateTimer -= dt;

  if (agent.targetX !== null) {
    const dx = agent.targetX - agent.x;
    if (Math.abs(dx) > 10) {
      const config = ROLE_CONFIGS[agent.role];
      agent.vx = (dx > 0 ? 1 : -1) * config.baseSpeed * MAX_WALK_SPEED * 0.5;
      agent.direction = dx > 0 ? 1 : -1;
    } else {
      agent.vx = 0;
    }
  }

  if (agent.stateTimer <= 0) {
    transitionToIdle(agent);
  }
};

export const updateBehavior = (agent: Agent, state: SimulationState, dt: number): void => {
  agent.bobPhase += dt * 0.005;

  if (!agent.grounded && agent.currentState !== 'jumping') {
    return;
  }

  const config = ROLE_CONFIGS[agent.role];
  if (agent.grounded && agent.currentState !== 'jumping' && Math.random() < config.jumpChance) {
    transitionToJumping(agent);
    return;
  }

  switch (agent.currentState) {
    case 'idle':
      updateIdle(agent, state, dt);
      break;
    case 'walking':
      updateWalking(agent, dt);
      break;
    case 'thinking':
      updateThinking(agent, dt);
      break;
    case 'jumping':
      break;
    case 'landing':
      updateLanding(agent, dt);
      break;
    case 'interacting':
      updateInteracting(agent, state, dt);
      break;
  }
};
