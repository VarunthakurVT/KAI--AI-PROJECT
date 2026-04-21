import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarClock, ExternalLink, Play, Pause } from 'lucide-react';

import { useUIStore } from '../../shared/store/useUIStore';
import { GlassCard } from '../../shared/ui/GlassCard';
import { RealtimeClock } from '../../shared/ui/RealtimeClock';
import { StudyTimer } from '../../shared/ui/StudyTimer';
import { CalendarCountdown } from '../../shared/ui/CalendarCountdown';
import { ActiveProtocolWidget } from './ActiveProtocolWidget';

const formatTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

export function ActiveProtocol() {
  const { calendarEvents, completeToday } = useUIStore();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const scheduledEvents = useMemo(
    () =>
      [...calendarEvents]
        .map((event) => ({
          ...event,
          _startMs: new Date(event.start).getTime(),
          _endMs: new Date(event.end).getTime(),
        }))
        .filter((event) => !Number.isNaN(event._startMs) && !Number.isNaN(event._endMs))
        .sort((a, b) => a._startMs - b._startMs),
    [calendarEvents],
  );

  const activeEvent =
    scheduledEvents.find((event) => event._startMs <= nowMs && nowMs <= event._endMs + 15000) ?? null;

  const upcoming = scheduledEvents
    .filter((event) => event._endMs > nowMs && (!activeEvent || event._startMs > activeEvent._startMs))
    .slice(0, activeEvent ? 2 : 3);

  const handleAutoComplete = ({
    plannedMinutes,
    topicLabel,
  }: {
    plannedMinutes: number;
    topicLabel: string;
  }) => {
    completeToday(plannedMinutes, [topicLabel]);
  };

  return (
    <div className="space-y-3">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <CalendarClock size={14} />
          Active Protocol
        </div>
        <div className="text-xs text-slate-500">
          {activeEvent ? 'In Session' : upcoming.length > 0 ? 'Upcoming' : 'Idle'}
        </div>
      </div>

      {/* Time Tracking Widgets - Show when calendar is active */}
      {(activeEvent || upcoming.length > 0) && (
        <GlassCard className="p-3">
          <div className="space-y-3">
            {/* Time Widgets */}
            <motion.div
              animate={{ opacity: isRunning ? 1 : 0.6 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              <RealtimeClock />
              <div className="border-t border-slate-800/50 pt-3" />
              <StudyTimer isRunning={isRunning} />
              <div className="border-t border-slate-800/50 pt-3" />
              <CalendarCountdown events={calendarEvents} />
            </motion.div>

            {/* Start/Stop Button Controls */}
            <div className="border-t border-slate-800/50 pt-3 flex gap-2">
              <motion.button
                onClick={() => setIsRunning(true)}
                className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-all ${
                  isRunning
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                    : 'bg-slate-800/30 text-slate-400 border border-slate-700/50 hover:bg-slate-800/50'
                }`}
                whileHover={!isRunning ? { scale: 1.05 } : {}}
                whileTap={{ scale: 0.95 }}
              >
                <Play size={16} />
                Start
              </motion.button>

              <motion.button
                onClick={() => setIsRunning(false)}
                className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-all ${
                  !isRunning
                    ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                    : 'bg-slate-800/30 text-slate-400 border border-slate-700/50 hover:bg-slate-800/50'
                }`}
                whileHover={isRunning ? { scale: 1.05 } : {}}
                whileTap={{ scale: 0.95 }}
              >
                <Pause size={16} />
                Pause
              </motion.button>
            </div>
          </div>
        </GlassCard>
      )}

      {activeEvent ? (
        <ActiveProtocolWidget event={activeEvent} onAutoComplete={handleAutoComplete} />
      ) : null}

      {upcoming.length === 0 && !activeEvent ? (
        <GlassCard className="p-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-3 py-3 text-xs leading-5 text-slate-400">
            No study blocks scheduled yet. Ask Commander something like:
            <div className="mt-2 font-mono text-slate-300">Find 2 hours for C++ Pointers tomorrow</div>
          </div>
        </GlassCard>
      ) : upcoming.length > 0 ? (
        <GlassCard className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">
              {activeEvent ? 'Next Up' : 'Upcoming Blocks'}
            </div>
            <div className="text-xs text-slate-600">{upcoming.length} queued</div>
          </div>

          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {upcoming.map((event) => (
                <motion.div
                  key={`${event.id ?? event.start}-${event.title}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="rounded-2xl border border-slate-800 bg-slate-900/40 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-slate-200">{event.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {formatDate(event.start)} - {formatTime(event.start)}-{formatTime(event.end)}
                      </div>
                    </div>
                    {event.html_link ? (
                      <a
                        href={event.html_link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-300 hover:border-slate-500"
                        title="Open in Google Calendar"
                      >
                        Open <ExternalLink size={12} />
                      </a>
                    ) : null}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </GlassCard>
      ) : null}
    </div>
  );
}
