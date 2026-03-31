import type { Agent, AgentRole } from '../types';
import { ROLE_CONFIGS, AGENT_NAMES, INITIAL_AGENTS } from '../constants';

let nextId = 0;
const usedNames = new Set<string>();

const pickName = (role: AgentRole): string => {
  const pool = AGENT_NAMES[role];
  const available = pool.filter((n) => !usedNames.has(n));
  const name = available.length > 0
    ? available[Math.floor(Math.random() * available.length)]
    : `${pool[0]}-${nextId}`;
  usedNames.add(name);
  return name;
};

export const createAgent = (role: AgentRole, sceneWidth: number, groundY: number): Agent => {
  const config = ROLE_CONFIGS[role];
  const id = `agent-${nextId++}`;
  const margin = 40;
  const x = margin + Math.random() * (sceneWidth - margin * 2);

  return {
    id,
    name: pickName(role),
    role,
    color: config.color,
    x,
    y: groundY,
    vx: 0,
    vy: 0,
    direction: Math.random() > 0.5 ? 1 : -1,
    grounded: true,
    currentState: 'idle',
    stateTimer: 500 + Math.random() * 1500,
    energy: 60 + Math.random() * 40,
    targetX: null,
    statusText: '',
    bobPhase: Math.random() * Math.PI * 2,
  };
};

export const spawnInitialAgents = (sceneWidth: number, groundY: number): Agent[] =>
  INITIAL_AGENTS.map((role) => createAgent(role, sceneWidth, groundY));

export const releaseAgentName = (name: string): void => {
  usedNames.delete(name);
};
