export type AgentRole = 'planner' | 'coder' | 'tester' | 'reviewer' | 'researcher';

export type AgentState =
  | 'idle'
  | 'walking'
  | 'jumping'
  | 'landing'
  | 'thinking'
  | 'interacting';

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  direction: 1 | -1;
  grounded: boolean;
  currentState: AgentState;
  stateTimer: number;
  energy: number;
  targetX: number | null;
  statusText: string;
  bobPhase: number;
}

export interface RoleConfig {
  color: string;
  baseSpeed: number;
  jumpChance: number;
  wanderRange: number;
  thinkDuration: number;
  statusTexts: string[];
}

export interface SimulationState {
  agents: Agent[];
  paused: boolean;
  groundY: number;
  sceneWidth: number;
  sceneHeight: number;
  time: number;
}
