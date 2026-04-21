import { Suspense, lazy } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Info, Zap, BookOpen } from 'lucide-react';
import { GlassCard } from '../../shared/ui/GlassCard';
import { useUIStore } from '../../shared/store/useUIStore';

const MasteryMap3D = lazy(() =>
  import('./MasteryMap3D').then((mod) => ({ default: mod.MasteryMap3D }))
);

function LoadingFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <p className="text-slate-400 text-sm">Initializing 3D Knowledge Graph...</p>
      </div>
    </div>
  );
}

export function Vault() {
  const { knowledgeNodes } = useUIStore();
  
  const totalMastery = Math.round(
    knowledgeNodes.reduce((acc, n) => acc + n.mastery, 0) / knowledgeNodes.length
  );
  
  const masteredCount = knowledgeNodes.filter((n) => n.mastery >= 80).length;

  return (
    <div className="h-full relative">
      <Suspense fallback={<LoadingFallback />}>
        <MasteryMap3D />
      </Suspense>

      <div className="absolute top-4 left-4 right-4 flex items-start justify-between pointer-events-none">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="pointer-events-auto"
        >
          <GlassCard className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <BookOpen size={20} className="text-amber-500" />
              </div>
              <div>
                <h2 className="text-slate-200 font-semibold">Knowledge Vault</h2>
                <p className="text-slate-500 text-xs">3D Mastery Visualization</p>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex gap-3 pointer-events-auto"
        >
          <GlassCard className="p-3 flex items-center gap-2">
            <Zap size={16} className="text-amber-500" />
            <div>
              <p className="text-xs text-slate-500">Avg Mastery</p>
              <p className="text-sm font-semibold text-slate-200">{totalMastery}%</p>
            </div>
          </GlassCard>
          <GlassCard className="p-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <div>
              <p className="text-xs text-slate-500">Mastered</p>
              <p className="text-sm font-semibold text-slate-200">{masteredCount}/{knowledgeNodes.length}</p>
            </div>
          </GlassCard>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute bottom-4 left-4 pointer-events-auto"
      >
        <GlassCard className="p-3 flex items-center gap-2">
          <Info size={14} className="text-slate-500" />
          <p className="text-xs text-slate-400">Drag to rotate • Scroll to zoom</p>
        </GlassCard>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute bottom-4 right-4 pointer-events-auto"
      >
        <GlassCard className="p-3">
          <p className="text-xs text-slate-500 mb-2">Mastery Levels</p>
          <div className="flex flex-col gap-1">
            {[
              { color: 'bg-emerald-500', label: 'Mastered (80%+)' },
              { color: 'bg-amber-500', label: 'Proficient (60-79%)' },
              { color: 'bg-blue-500', label: 'Learning (40-59%)' },
              { color: 'bg-gray-500', label: 'Beginner (<40%)' },
            ].map((level) => (
              <div key={level.label} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${level.color}`} />
                <span className="text-xs text-slate-400">{level.label}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}
