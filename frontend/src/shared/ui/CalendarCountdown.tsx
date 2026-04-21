import { useEffect, useState, useMemo } from 'react';
import { Calendar, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { CalendarEvent } from '../../shared/types';

interface CalendarCountdownProps {
  events: CalendarEvent[];
  className?: string;
}

export function CalendarCountdown({ events, className = '' }: CalendarCountdownProps) {
  const [countdown, setCountdown] = useState<string>('--:--');
  const [isWarning, setIsWarning] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const nextEvent = useMemo(() => {
    if (!events || events.length === 0) return null;

    const futureEvents = events
      .map((event) => ({
        ...event,
        _startMs: new Date(event.start).getTime(),
      }))
      .filter((event) => !Number.isNaN(event._startMs) && event._startMs > nowMs)
      .sort((a, b) => a._startMs - b._startMs);

    return futureEvents[0] || null;
  }, [events, nowMs]);

  useEffect(() => {
    if (!nextEvent) {
      setCountdown('--:--');
      setIsWarning(false);
      return;
    }

    const diffMs = nextEvent._startMs - nowMs;
    const totalSeconds = Math.floor(diffMs / 1000);

    if (totalSeconds <= 0) {
      setCountdown('Now');
      setIsWarning(true);
      return;
    }

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const timeStr =
      hours > 0
        ? `${hours}h ${minutes}m`
        : `${minutes}:${String(seconds).padStart(2, '0')}`;

    setCountdown(timeStr);

    // Warning when less than 15 minutes
    const isLowTime = totalSeconds < 15 * 60;
    setIsWarning(isLowTime);
  }, [nowMs, nextEvent]);

  if (!nextEvent) {
    return (
      <motion.div
        className={`flex items-center gap-3 ${className}`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <Calendar size={20} className="text-slate-500" />
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wider text-slate-500">Next Event</span>
          <span className="font-mono text-sm text-slate-400">No events scheduled</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className={`flex items-center gap-3 ${className}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        animate={
          isWarning
            ? {
                scale: [1, 1.15, 1],
                boxShadow: [
                  '0 0 0 0 rgba(239, 68, 68, 0.3)',
                  '0 0 0 8px rgba(239, 68, 68, 0)',
                ],
              }
            : {}
        }
        transition={
          isWarning
            ? { duration: 1.5, repeat: Infinity }
            : { duration: 0.3 }
        }
        className={`shrink-0 ${isWarning ? 'text-red-500' : 'text-violet-400'}`}
      >
        {isWarning ? <AlertCircle size={20} /> : <Calendar size={20} />}
      </motion.div>
      <div className="flex flex-col min-w-0">
        <span className="text-xs uppercase tracking-wider text-slate-500">Time Remaining</span>
        <div className="flex items-baseline gap-2">
          <motion.span
            key={countdown}
            initial={{ opacity: 0.7 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className={`font-mono text-lg font-bold tabular-nums ${
              isWarning ? 'text-red-400' : 'text-violet-400'
            }`}
          >
            {countdown}
          </motion.span>
          <span className="text-xs text-slate-500 truncate">
            {nextEvent.title}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
