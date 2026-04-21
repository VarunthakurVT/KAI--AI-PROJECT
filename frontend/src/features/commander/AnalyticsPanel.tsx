import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Target, Clock, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUIStore } from '../../shared/store/useUIStore';
import { GlassCard } from '../../shared/ui/GlassCard';
import { ProgressRing } from '../../shared/ui/ProgressRing';
import { ActiveProtocol } from './ActiveProtocol';

type ViewMode = 'today' | 'month';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function AnalyticsPanel() {
  const { progress, completeToday } = useUIStore();
  const [viewMode, setViewMode] = useState<ViewMode>('today');
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const todayProgress = progress.dailyProgress.find(d => d.date === todayStr);
  
  // Get current month data
  const currentMonthStr = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}`;
  const monthData = progress.monthlyProgress.find(m => m.month === currentMonthStr);
  
  // Get days in month for calendar
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    
    return { daysInMonth, startingDay };
  };
  
  const { daysInMonth, startingDay } = getDaysInMonth(selectedMonth);
  
  // Get progress for each day in the month
  const getProgressForDay = (day: number) => {
    const dateStr = `${currentMonthStr}-${day.toString().padStart(2, '0')}`;
    return progress.dailyProgress.find(d => d.date === dateStr);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedMonth);
    newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    setSelectedMonth(newDate);
  };

  const stats = [
    { icon: Flame, label: 'Streak', value: `${progress.currentStreak} days`, color: 'text-orange-500' },
    { icon: Target, label: 'Focus', value: progress.activeTopic, color: 'text-amber-500' },
    { icon: Clock, label: 'Today', value: `${progress.todayMinutes}m`, color: 'text-emerald-500' },
    { icon: TrendingUp, label: 'Best', value: `${progress.longestStreak} days`, color: 'text-sky-500' },
  ];

  const completionPercentage = monthData 
    ? Math.round((monthData.daysCompleted / monthData.totalDays) * 100)
    : 0;

  return (
    <div className="h-full p-4 flex flex-col gap-4 overflow-y-auto">
      {/* View Toggle */}
      <div className="flex gap-2 p-1 bg-slate-900/50 rounded-xl">
        <button
          onClick={() => setViewMode('today')}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            viewMode === 'today'
              ? 'bg-amber-500/20 text-amber-500'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Today
        </button>
        <button
          onClick={() => setViewMode('month')}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            viewMode === 'month'
              ? 'bg-amber-500/20 text-amber-500'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Month
        </button>
      </div>

      <AnimatePresence mode="wait">
        {viewMode === 'today' ? (
          <motion.div
            key="today"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="flex flex-col gap-4"
          >
            {/* Daily Progress Ring */}
            <GlassCard className="p-6 flex flex-col items-center">
              <h3 className="text-slate-400 text-sm mb-4">Daily Progress</h3>
              <ProgressRing 
                progress={progress.todayCompleted ? 100 : Math.min(Math.round((progress.todayMinutes / 60) * 100), 99)} 
                label={progress.todayCompleted ? 'Complete!' : 'Goal: 60m'} 
              />
              {!progress.todayCompleted && (
                <motion.button
                  onClick={() => completeToday(60, [progress.activeTopic])}
                  className="mt-4 px-4 py-2 rounded-lg bg-amber-500/20 text-amber-500 text-sm font-medium hover:bg-amber-500/30 transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Mark Complete
                </motion.button>
              )}
            </GlassCard>

            <ActiveProtocol />

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <GlassCard className="p-4" hover>
                    <stat.icon size={18} className={stat.color} />
                    <p className="text-slate-400 text-xs mt-2">{stat.label}</p>
                    <p className="text-slate-200 font-semibold text-sm mt-1 truncate">{stat.value}</p>
                  </GlassCard>
                </motion.div>
              ))}
            </div>

            {/* Today's Topics */}
            <GlassCard className="p-4">
              <h4 className="text-slate-400 text-sm mb-3">Today's Topics</h4>
              <div className="space-y-2">
                {(todayProgress?.topicsStudied && todayProgress.topicsStudied.length > 0 
                  ? todayProgress.topicsStudied 
                  : [progress.activeTopic]
                ).map((topic, i) => (
                  <motion.div
                    key={topic}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-2 text-sm"
                  >
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-slate-300">{topic}</span>
                  </motion.div>
                ))}
              </div>
            </GlassCard>
          </motion.div>
        ) : (
          <motion.div
            key="month"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col gap-4"
          >
            {/* Month Header */}
            <GlassCard className="p-4">
              <div className="flex items-center justify-between mb-4">
                <motion.button
                  onClick={() => navigateMonth('prev')}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <ChevronLeft size={18} />
                </motion.button>
                <div className="text-center">
                  <h3 className="text-slate-200 font-semibold">
                    {MONTHS[selectedMonth.getMonth()]} {selectedMonth.getFullYear()}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {monthData?.daysCompleted || 0} days completed
                  </p>
                </div>
                <motion.button
                  onClick={() => navigateMonth('next')}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-30"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  disabled={selectedMonth.getMonth() === today.getMonth() && selectedMonth.getFullYear() === today.getFullYear()}
                >
                  <ChevronRight size={18} />
                </motion.button>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1">
                {/* Weekday headers */}
                {WEEKDAYS.map(day => (
                  <div key={day} className="text-center text-xs text-slate-600 py-1">
                    {day[0]}
                  </div>
                ))}
                
                {/* Empty cells for starting day */}
                {Array.from({ length: startingDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square" />
                ))}
                
                {/* Days */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dayProgress = getProgressForDay(day);
                  const dateToCheck = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), day);
                  const isToday = dateToCheck.toDateString() === today.toDateString();
                  const isFuture = dateToCheck > today;
                  
                  return (
                    <motion.div
                      key={day}
                      className={`aspect-square rounded-lg flex items-center justify-center text-xs relative ${
                        isToday
                          ? 'ring-2 ring-amber-500 ring-offset-1 ring-offset-slate-950'
                          : ''
                      } ${
                        dayProgress?.completed
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : isFuture
                          ? 'text-slate-700'
                          : dayProgress && dayProgress.studyMinutes > 0
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'text-slate-500 hover:bg-slate-800/50'
                      }`}
                      whileHover={!isFuture ? { scale: 1.1 } : undefined}
                      title={dayProgress ? `${dayProgress.studyMinutes}m studied` : ''}
                    >
                      {day}
                      {dayProgress?.completed && (
                        <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500" />
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </GlassCard>

            {/* Monthly Stats */}
            <GlassCard className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-400">Monthly Completion</span>
                <span className="text-sm font-semibold text-amber-500">{completionPercentage}%</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${completionPercentage}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
              <div className="flex justify-between mt-2 text-xs text-slate-500">
                <span>{monthData?.totalMinutes || 0}m total</span>
                <span>{monthData?.topicsCompleted?.length || 0} topics</span>
              </div>
            </GlassCard>

            {/* Monthly Topics */}
            {monthData && monthData.topicsCompleted && monthData.topicsCompleted.length > 0 && (
              <GlassCard className="p-4">
                <h4 className="text-slate-400 text-sm mb-3">Topics This Month</h4>
                <div className="flex flex-wrap gap-2">
                  {monthData.topicsCompleted.map((topic) => (
                    <span
                      key={topic}
                      className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </GlassCard>
            )}

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/50" />
                <span>Completed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-amber-500/10 border border-amber-500/30" />
                <span>Partial</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-slate-800 border border-slate-700" />
                <span>Missed</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
