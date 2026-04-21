import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface TabButtonProps {
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

export function TabButton({ icon: Icon, label, isActive, onClick }: TabButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      className={`relative flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 w-full ${
        isActive
          ? 'bg-amber-500/10 text-amber-500'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
      }`}
      whileHover={{ x: 4 }}
      whileTap={{ scale: 0.98 }}
    >
      <Icon size={20} />
      <span className="font-medium text-sm">{label}</span>
      {isActive && (
        <motion.div
          layoutId="activeTab"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-amber-500 rounded-r-full"
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      )}
    </motion.button>
  );
}
