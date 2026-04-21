import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { OnboardingScreen } from './components/OnboardingScreen';
import { BootScreen } from './components/BootScreen';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { useUIStore } from './shared/store/useUIStore';

export default function App() {
  const { userName, setUserName, setSelectedCourseId, addMessage, clearMessages, fetchProgress } = useUIStore();
  const [appState, setAppState] = useState<'onboarding' | 'booting' | 'ready'>(
    () => (userName && userName.trim() !== '') ? 'booting' : 'onboarding'
  );

  const handleOnboardingComplete = (name: string, courseId?: string) => {
    setUserName(name);
    if (courseId) {
      setSelectedCourseId(courseId);
    }
    clearMessages();
    addMessage({
      id: Date.now().toString(),
      role: 'system',
      content: `Welcome to KAI, ${name}! I'm your study buddy – you bring the grind, I bring the genius. What would you like to explore today?`,
      timestamp: new Date(),
    });
    setAppState('booting');
  };

  const handleBootComplete = () => {
    setAppState('ready');
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-200">
      <AnimatePresence mode="wait">
        {appState === 'onboarding' && (
          <motion.div
            key="onboarding"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full"
          >
            <OnboardingScreen onComplete={handleOnboardingComplete} />
          </motion.div>
        )}

        {appState === 'booting' && (
          <motion.div
            key="boot"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full"
          >
            <BootScreen onComplete={handleBootComplete} />
          </motion.div>
        )}

        {appState === 'ready' && (
          <motion.div
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="h-full flex"
          >
            <Sidebar />
            <Dashboard />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
