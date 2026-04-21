import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export function GlassCard({ children, className = '', hover = false }: GlassCardProps) {
  return (
    <motion.div
      className={`backdrop-blur-md bg-white/5 border border-slate-800/50 rounded-xl ${className}`}
      whileHover={hover ? { scale: 1.02, borderColor: 'rgba(251, 191, 36, 0.3)' } : undefined}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}
