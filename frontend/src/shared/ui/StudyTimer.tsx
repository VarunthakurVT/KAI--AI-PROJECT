import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';

interface StudyTimerProps {
  className?: string;
  isRunning?: boolean;
  onStartTime?: (startTime: Date) => void;
}

export function StudyTimer({ className = '', isRunning = true, onStartTime }: StudyTimerProps) {
  const [elapsed, setElapsed] = useState<string>('00:00');
  const [startTime] = useState<Date>(new Date());
  const pausedTimeRef = useRef<number>(0);
  const pauseStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (onStartTime) {
      onStartTime(startTime);
    }
  }, [startTime, onStartTime]);

  useEffect(() => {
    // Handle pause/resume
    if (!isRunning && pauseStartRef.current === null) {
      pauseStartRef.current = Date.now();
    } else if (isRunning && pauseStartRef.current !== null) {
      pausedTimeRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
  }, [isRunning]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      let diffMs = now - startTime.getTime() - pausedTimeRef.current;

      // If currently paused, adjust for current pause duration
      if (pauseStartRef.current !== null) {
        diffMs -= (now - pauseStartRef.current);
      }

      const seconds = Math.floor((diffMs / 1000) % 60);
      const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
      const hours = Math.floor(diffMs / (1000 * 60 * 60));

      const timeStr =
        hours > 0
          ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
          : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

      setElapsed(timeStr);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [startTime]);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <motion.div
        animate={isRunning ? { scale: [1, 1.2, 1] } : {}}
        transition={{ duration: 1.5, repeat: Infinity }}
        className={`transition-colors ${isRunning ? 'text-emerald-500' : 'text-slate-500'}`}
      >
        <Zap size={20} />
      </motion.div>
      <div className="flex flex-col">
        <span className="text-xs uppercase tracking-wider text-slate-500">
          {isRunning ? 'Study Timer' : 'Paused'}
        </span>
        <motion.span
          key={elapsed}
          initial={{ opacity: 0.7 }}
          animate={{ opacity: isRunning ? 1 : 0.6 }}
          transition={{ duration: 0.3 }}
          className={`font-mono text-lg font-bold ${isRunning ? 'text-emerald-400' : 'text-slate-400'}`}
        >
          {elapsed}
        </motion.span>
      </div>
    </div>
  );
}
