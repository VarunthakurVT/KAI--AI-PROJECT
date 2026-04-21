import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarEvent } from '../../shared/types';

const COMPLETED_BLOCKS_STORAGE_KEY = 'kai-study-clock-completions';
const URGENT_WINDOW_MS = 5 * 60 * 1000;

type ClockTone = 'calm' | 'warning' | 'urgent';

interface StudyClockSyncPayload {
  event: CalendarEvent;
  plannedMinutes: number;
  topicLabel: string;
}

interface UseStudyClockOptions {
  event: CalendarEvent | null;
  onAutoComplete?: (payload: StudyClockSyncPayload) => void;
}

function getCompletionKey(event: CalendarEvent) {
  return `${event.id ?? event.title}:${event.start}:${event.end}`;
}

function loadCompletedKeys() {
  if (typeof window === 'undefined') return new Set<string>();

  try {
    const raw = localStorage.getItem(COMPLETED_BLOCKS_STORAGE_KEY);
    if (!raw) return new Set<string>();

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set<string>(parsed.filter((value): value is string => typeof value === 'string')) : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

function persistCompletedKeys(keys: Set<string>) {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(COMPLETED_BLOCKS_STORAGE_KEY, JSON.stringify(Array.from(keys).slice(-200)));
  } catch {
    // Ignore storage failures; the in-memory set still protects this session.
  }
}

function formatRemainingTime(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function buildTopicLabel(title: string) {
  return title.trim() || 'Focused Study Session';
}

export function useStudyClock({ event, onAutoComplete }: UseStudyClockOptions) {
  const [now, setNow] = useState(() => Date.now());
  const completedKeysRef = useRef<Set<string>>(loadCompletedKeys());
  const inFlightKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const clock = useMemo(() => {
    if (!event) {
      return null;
    }

    const startMs = new Date(event.start).getTime();
    const endMs = new Date(event.end).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      return null;
    }

    const totalMs = endMs - startMs;
    const elapsedMs = Math.min(Math.max(now - startMs, 0), totalMs);
    const remainingMs = Math.max(endMs - now, 0);
    const progressPercentage = Math.min((elapsedMs / totalMs) * 100, 100);
    const batteryPercentage = Math.max(100 - progressPercentage, 0);
    const isUrgent = remainingMs > 0 && remainingMs <= URGENT_WINDOW_MS;
    const isWarning = !isUrgent && batteryPercentage <= 50;
    const tone: ClockTone = isUrgent ? 'urgent' : isWarning ? 'warning' : 'calm';
    const completionKey = getCompletionKey(event);

    return {
      completionKey,
      startMs,
      endMs,
      totalMs,
      elapsedMs,
      remainingMs,
      progressPercentage,
      batteryPercentage,
      formattedRemaining: formatRemainingTime(remainingMs),
      isComplete: remainingMs <= 0,
      isUrgent,
      isWarning,
      tone,
      plannedMinutes: Math.max(1, Math.round(totalMs / 60000)),
      topicLabel: buildTopicLabel(event.title),
    };
  }, [event, now]);

  useEffect(() => {
    if (!clock || !event || !clock.isComplete || !onAutoComplete) {
      return;
    }

    if (completedKeysRef.current.has(clock.completionKey)) {
      return;
    }

    if (inFlightKeyRef.current === clock.completionKey) {
      return;
    }

    inFlightKeyRef.current = clock.completionKey;

    try {
      onAutoComplete({
        event,
        plannedMinutes: clock.plannedMinutes,
        topicLabel: clock.topicLabel,
      });
      completedKeysRef.current.add(clock.completionKey);
      persistCompletedKeys(completedKeysRef.current);
    } finally {
      inFlightKeyRef.current = null;
    }
  }, [clock, event, onAutoComplete]);

  return clock;
}
