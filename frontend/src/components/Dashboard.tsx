import { Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useUIStore } from '../shared/store/useUIStore';
import { Commander } from '../features/commander';
import { Scribe } from '../features/scribe';

const Vault = lazy(() => 
  import('../features/vault').then((mod) => ({ default: mod.Vault })).catch((err) => {
    console.error('Failed to load Vault:', err);
    return { default: () => <div>Error loading Vault</div> };
  })
);
const Examiner = lazy(() => 
  import('../features/examiner').then((mod) => ({ default: mod.Examiner })).catch((err) => {
    console.error('Failed to load Examiner:', err);
    return { default: () => <div>Error loading Examiner</div> };
  })
);

function LoadingFallback() {
  return (
    <div className="h-full flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
    </div>
  );
}

export function Dashboard() {
  const { activeTab } = useUIStore();

  const renderContent = () => {
    switch (activeTab) {
      case 'commander':
        return <Commander />;
      case 'scribe':
        return <Scribe />;
      case 'vault':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Vault />
          </Suspense>
        );
      case 'examiner':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Examiner />
          </Suspense>
        );
      default:
        return <Commander />;
    }
  };

  return (
    <div className="flex-1 h-full overflow-hidden bg-slate-900 p-4">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
          className="h-full"
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
