import { motion } from 'framer-motion';
import { Clock3, Zap } from 'lucide-react';
import { CalendarEvent } from '../../shared/types';
import { GlassCard } from '../../shared/ui/GlassCard';
import { useStudyClock } from './useStudyClock';

interface ActiveProtocolWidgetProps {
  event: CalendarEvent;
  onAutoComplete?: (payload: { event: CalendarEvent; plannedMinutes: number; topicLabel: string }) => void;
}

const formatTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export function ActiveProtocolWidget({ event, onAutoComplete }: ActiveProtocolWidgetProps) {
  const clock = useStudyClock({ event, onAutoComplete });

  if (!clock) {
    return null;
  }

  const toneClasses = {
    calm: {
      shell: 'border-cyan-500/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.12),rgba(2,6,23,0.92)_55%,rgba(15,23,42,0.94))]',
      timer: 'text-cyan-300',
      accent: 'bg-cyan-400',
      pill: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200',
      glow: 'shadow-[0_0_40px_rgba(34,211,238,0.12)]',
    },
    warning: {
      shell: 'border-amber-500/25 bg-[linear-gradient(135deg,rgba(245,158,11,0.14),rgba(2,6,23,0.92)_55%,rgba(15,23,42,0.94))]',
      timer: 'text-amber-300',
      accent: 'bg-amber-400',
      pill: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
      glow: 'shadow-[0_0_40px_rgba(245,158,11,0.12)]',
    },
    urgent: {
      shell: 'border-rose-500/30 bg-[linear-gradient(135deg,rgba(244,63,94,0.16),rgba(2,6,23,0.92)_55%,rgba(15,23,42,0.96))]',
      timer: 'text-rose-300',
      accent: 'bg-rose-400',
      pill: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
      glow: 'shadow-[0_0_46px_rgba(244,63,94,0.16)]',
    },
  }[clock.tone];

  return (
    <GlassCard className={`overflow-hidden border ${toneClasses.shell} ${toneClasses.glow}`}>
      <div className="p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.24em] ${toneClasses.pill}`}>
              <Zap size={12} />
              Active Focus Block
            </div>
            <h3 className="mt-3 text-base font-semibold text-slate-100">{event.title}</h3>
            <p className="mt-1 text-xs text-slate-400">
              {formatTime(event.start)} - {formatTime(event.end)}
            </p>
          </div>

          <div className="text-right">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Battery</div>
            <div className="mt-1 text-sm font-medium text-slate-200">
              {Math.round(clock.batteryPercentage)}%
            </div>
          </div>
        </div>

        <motion.div
          animate={clock.isUrgent ? { scale: [1, 1.02, 1] } : undefined}
          transition={clock.isUrgent ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
          className="rounded-3xl border border-white/5 bg-slate-950/55 px-4 py-5"
        >
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-slate-500">
            <Clock3 size={12} />
            Time Remaining
          </div>
          <div className={`mt-3 font-mono text-[2.35rem] font-semibold tracking-tight ${toneClasses.timer} ${clock.isUrgent ? 'animate-pulse' : ''}`}>
            {clock.formattedRemaining}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>{Math.round(clock.progressPercentage)}% completed</span>
            <span>{clock.plannedMinutes} min block</span>
          </div>
        </motion.div>
      </div>

      <div className="border-t border-white/5 bg-slate-950/65 px-4 py-3">
        <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-slate-500">
          <span>Focus Battery</span>
          <span>{clock.isUrgent ? 'Final stretch' : clock.isWarning ? 'Halfway mark' : 'Steady pace'}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800/90">
          <motion.div
            className={`h-full ${toneClasses.accent} ${clock.isUrgent ? 'animate-pulse' : ''}`}
            animate={{ width: `${clock.batteryPercentage}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
      </div>
    </GlassCard>
  );
}
