import { motion } from 'framer-motion';
import { MessageSquare, Mic, Box, Code2, Settings, HelpCircle, LogOut, Flame } from 'lucide-react';
import { useUIStore } from '../shared/store/useUIStore';
import { logout } from '../shared/api/nexusApi';
import { TabButton } from '../shared/ui/TabButton';

const tabs = [
  { id: 'commander' as const, icon: MessageSquare, label: 'Commander' },
  { id: 'scribe' as const, icon: Mic, label: 'Scribe' },
  { id: 'vault' as const, icon: Box, label: 'Vault' },
  { id: 'examiner' as const, icon: Code2, label: 'Examiner' },
];

export function Sidebar() {
  const { activeTab, setActiveTab, progress, userName, setUserName, clearMessages } = useUIStore();

  const handleLogout = () => {
    if (confirm('Are you sure you want to log out?')) {
      logout();
      setUserName(null);
      clearMessages();
      window.location.reload();
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="w-56 h-full flex flex-col bg-slate-950 border-r border-slate-800">
      <div className="p-4 border-b border-slate-800">
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <span className="text-white font-bold text-lg">K</span>
          </div>
          <div>
            <h1 className="text-slate-200 font-bold">KAI</h1>
            <p className="text-slate-500 text-xs">your 2 a.m. study buddy.</p>
          </div>
        </motion.div>
      </div>

      {progress.currentStreak > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-3 mt-3 p-3 rounded-xl bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/20"
        >
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-orange-500/20">
              <Flame size={16} className="text-orange-500" />
            </div>
            <div>
              <p className="text-orange-400 text-sm font-semibold">{progress.currentStreak} Day Streak!</p>
              <p className="text-slate-500 text-xs">Keep it going!</p>
            </div>
          </div>
        </motion.div>
      )}

      <nav className="flex-1 p-3 space-y-1">
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            icon={tab.icon}
            label={tab.label}
            isActive={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </nav>

      <div className="p-3 border-t border-slate-800 space-y-1">
        <TabButton
          icon={Settings}
          label="Settings"
          isActive={false}
          onClick={() => {}}
        />
        <TabButton
          icon={HelpCircle}
          label="Help"
          isActive={false}
          onClick={() => {}}
        />
      </div>

      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white text-xs font-bold">
              {getInitials(userName)}
            </div>
            {progress.todayCompleted && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-slate-950 flex items-center justify-center">
                <span className="text-[8px]">✓</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-200 text-sm font-medium truncate">{userName || 'Student'}</p>
            <p className="text-slate-500 text-xs">
              {progress.todayCompleted ? '✨ Day complete!' : `${progress.todayMinutes}m today`}
            </p>
          </div>
          <motion.button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="Log out"
          >
            <LogOut size={16} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
