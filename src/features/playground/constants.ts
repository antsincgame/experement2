import type { AgentRole, RoleConfig } from './types';

export const GRAVITY = 0.5;
export const GROUND_FRICTION = 0.85;
export const JUMP_VELOCITY = -9;
export const MAX_WALK_SPEED = 2.5;
export const AGENT_HEAD_RADIUS = 8;
export const AGENT_BODY_HEIGHT = 15;
export const AGENT_LEG_LENGTH = 12;
export const GROUND_OFFSET = 60;
export const SEPARATION_DISTANCE = 35;
export const SEPARATION_FORCE = 0.3;

export const ROLE_CONFIGS: Record<AgentRole, RoleConfig> = {
  planner: {
    color: '#7C4DFF',
    baseSpeed: 0.8,
    jumpChance: 0.003,
    wanderRange: 150,
    thinkDuration: 3000,
    statusTexts: ['planning...', 'architecting...', 'thinking...', 'designing...'],
  },
  coder: {
    color: '#00E5FF',
    baseSpeed: 1.5,
    jumpChance: 0.008,
    wanderRange: 300,
    thinkDuration: 1000,
    statusTexts: ['coding...', 'debugging...', 'typing...', 'refactoring...'],
  },
  tester: {
    color: '#FF3366',
    baseSpeed: 1.2,
    jumpChance: 0.015,
    wanderRange: 400,
    thinkDuration: 800,
    statusTexts: ['testing...', 'breaking things...', 'found a bug!', 'all green!'],
  },
  reviewer: {
    color: '#FFD700',
    baseSpeed: 1.0,
    jumpChance: 0.004,
    wanderRange: 200,
    thinkDuration: 2000,
    statusTexts: ['reviewing...', 'LGTM?', 'hmm...', 'nit: ...'],
  },
  researcher: {
    color: '#00FF88',
    baseSpeed: 1.3,
    jumpChance: 0.010,
    wanderRange: 500,
    thinkDuration: 1500,
    statusTexts: ['exploring...', 'reading docs...', 'investigating...', 'eureka!'],
  },
};

export const AGENT_NAMES: Record<AgentRole, string[]> = {
  planner: ['Alice', 'Archie', 'Petra'],
  coder: ['Bob', 'Cleo', 'Dev', 'Kai'],
  tester: ['Quinn', 'Tara', 'Brix'],
  reviewer: ['Rex', 'Rita', 'Sage'],
  researcher: ['Sam', 'Nova', 'Iris'],
};

export const ALL_ROLES: AgentRole[] = ['planner', 'coder', 'tester', 'reviewer', 'researcher'];

export const INITIAL_AGENTS: AgentRole[] = ['planner', 'coder', 'coder', 'tester', 'reviewer', 'researcher'];
