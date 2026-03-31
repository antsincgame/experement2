import type { SimulationState } from '../types';
import { applyPhysics, applySeparation } from './physics';
import { updateBehavior } from './behavior';

export const tick = (state: SimulationState, dt: number): void => {
  if (state.paused) return;

  const cappedDt = Math.min(dt, 50);
  state.time += cappedDt;

  for (const agent of state.agents) {
    updateBehavior(agent, state, cappedDt);
  }

  applySeparation(state.agents);

  for (const agent of state.agents) {
    applyPhysics(agent, state);
  }
};
