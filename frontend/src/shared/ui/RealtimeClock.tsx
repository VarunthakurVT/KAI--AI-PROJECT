import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';

interface RealimeClockProps {
  className?: string;
}

export function RealtimeClock({ className = '' }: RealimeClockProps) {
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    // Set initial time immediately
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      setCurrentTime(timeStr);
    };

    updateTime();

    // Update every second
    const interval = window.setInterval(updateTime, 1000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        className="text-amber-500"
      >
        <Clock size={20} />
      </motion.div>
      <div className="flex flex-col">
        <span className="text-xs uppercase tracking-wider text-slate-500">Current Time</span>
        <motion.span
          key={currentTime}
          initial={{ opacity: 0.7 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="font-mono text-lg font-bold text-amber-400"
        >
          {currentTime || '00:00:00'}
        </motion.span>
      </div>
    </div>
  );
}
