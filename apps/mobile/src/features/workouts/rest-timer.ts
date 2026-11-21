import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

export interface RestTimerState {
  endsAt: number | null;
  pausedRemainingMs: number | null;
}

export function getRemainingMs(state: RestTimerState, now = Date.now()): number {
  if (state.pausedRemainingMs !== null) return Math.max(0, state.pausedRemainingMs);
  if (state.endsAt === null) return 0;
  return Math.max(0, state.endsAt - now);
}

export function pauseTimer(state: RestTimerState, now = Date.now()): RestTimerState {
  if (state.endsAt === null) return state;
  return { endsAt: null, pausedRemainingMs: Math.max(0, state.endsAt - now) };
}

export function resumeTimer(state: RestTimerState, now = Date.now()): RestTimerState {
  if (state.pausedRemainingMs === null) return state;
  return { endsAt: now + state.pausedRemainingMs, pausedRemainingMs: null };
}

export function startRestTimer(durationSec: number, now = Date.now()): RestTimerState {
  if (durationSec <= 0) return { endsAt: null, pausedRemainingMs: null };
  return { endsAt: now + durationSec * 1000, pausedRemainingMs: null };
}

export function clearRestTimer(): RestTimerState {
  return { endsAt: null, pausedRemainingMs: null };
}

export function formatRestCountdown(remainingMs: number): string {
  const totalSec = Math.ceil(remainingMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function maybeHapticOnComplete(appActive: boolean): void {
  if (!appActive) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function useRestTimer() {
  const [state, setState] = useState<RestTimerState>(clearRestTimer());
  const [remainingMs, setRemainingMs] = useState(0);
  const appActiveRef = useRef(AppState.currentState === 'active');
  const completedRef = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      appActiveRef.current = next === 'active';
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    completedRef.current = false;
    const tick = () => {
      const left = getRemainingMs(state);
      setRemainingMs(left);
      if (left === 0 && state.endsAt !== null && !completedRef.current) {
        completedRef.current = true;
        maybeHapticOnComplete(appActiveRef.current);
        setState(clearRestTimer());
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [state]);

  const start = useCallback((durationSec: number) => {
    completedRef.current = false;
    setState(startRestTimer(durationSec));
  }, []);

  const pause = useCallback(() => {
    setState((prev) => pauseTimer(prev));
  }, []);

  const resume = useCallback(() => {
    setState((prev) => resumeTimer(prev));
  }, []);

  const skip = useCallback(() => {
    setState(clearRestTimer());
    setRemainingMs(0);
  }, []);

  const isRunning = state.endsAt !== null || state.pausedRemainingMs !== null;

  return {
    remainingMs,
    isRunning,
    isPaused: state.pausedRemainingMs !== null,
    start,
    pause,
    resume,
    skip,
    format: () => formatRestCountdown(remainingMs),
  };
}
