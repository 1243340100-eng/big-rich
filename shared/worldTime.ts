import type {GameState} from './types';

export const TIMES = ['morning', 'dusk', 'night'] as const;
export type TimeOfDay = typeof TIMES[number];
export const TIME_OF_DAY_MS = 90_000;

type MatchClock = Pick<GameState, 'status' | 'startedAt' | 'finishedAt' | 'turnStarted'>;

/** One persistent room epoch, independent of turns and client arrival time. */
export function ensureMatchClock(state: MatchClock, now = Date.now()): boolean {
  if(state.status === 'lobby')return false;
  let changed = false;
  if(!Number.isFinite(state.startedAt)){
    state.startedAt = Number.isFinite(state.turnStarted) ? state.turnStarted : now;
    changed = true;
  }
  if(state.status === 'finished' && !Number.isFinite(state.finishedAt)){
    state.finishedAt = Math.max(state.startedAt!, state.turnStarted || now);
    changed = true;
  }
  return changed;
}

export function matchTime(state: MatchClock, now: number) {
  const start = state.startedAt ?? state.turnStarted;
  const end = state.status === 'finished' ? state.finishedAt ?? start : now;
  const elapsed = Math.max(0, Number.isFinite(end - start) ? end - start : 0);
  const phase = Math.floor(elapsed / TIME_OF_DAY_MS);
  return {
    time: TIMES[phase % TIMES.length],
    next: TIMES[(phase + 1) % TIMES.length],
    day: Math.floor(phase / TIMES.length) + 1,
    remaining: TIME_OF_DAY_MS - elapsed % TIME_OF_DAY_MS,
  };
}
