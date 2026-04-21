import { create } from 'zustand';
import { AIChatMessage, ProgressState, AudioNote, KnowledgeNode, DayProgress, MonthProgress, CalendarEvent } from '../types';
import {
  getProgress,
  completeProgress as apiCompleteProgress,
  recordProgress as apiRecordProgress,
  getToken,
} from '../api/nexusApi';

type TabType = 'commander' | 'scribe' | 'vault' | 'examiner';

// Helper to get date string
const getDateString = (date: Date = new Date()) => {
  return date.toISOString().split('T')[0];
};

// Generate sample daily progress for the past 60 days (fallback for unauthenticated users)
const generateSampleDailyProgress = (): DayProgress[] => {
  const days: DayProgress[] = [];
  const today = new Date();
  
  for (let i = 59; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = getDateString(date);
    
    const completed = i === 0 ? false : Math.random() > 0.3;
    const minutes = completed ? Math.floor(Math.random() * 120) + 30 : (i === 0 ? 0 : Math.floor(Math.random() * 20));
    
    const topics = ['Pointers', 'Memory Management', 'Smart Pointers', 'RAII', 'Templates', 'STL', 'OOP'];
    const studiedTopics = completed 
      ? topics.slice(0, Math.floor(Math.random() * 3) + 1)
      : [];
    
    days.push({
      date: dateStr,
      completed,
      studyMinutes: minutes,
      topicsStudied: studiedTopics,
    });
  }
  
  return days;
};

// Generate monthly progress from daily progress
const generateMonthlyProgress = (dailyProgress: DayProgress[]): MonthProgress[] => {
  const monthMap = new Map<string, MonthProgress>();
  
  dailyProgress.forEach(day => {
    const month = day.date.slice(0, 7);
    const existing = monthMap.get(month);
    
    if (existing) {
      existing.daysCompleted += day.completed ? 1 : 0;
      existing.totalDays += 1;
      existing.totalMinutes += day.studyMinutes;
      day.topicsStudied.forEach(t => {
        if (!existing.topicsCompleted.includes(t)) {
          existing.topicsCompleted.push(t);
        }
      });
    } else {
      monthMap.set(month, {
        month,
        daysCompleted: day.completed ? 1 : 0,
        totalDays: 1,
        totalMinutes: day.studyMinutes,
        topicsCompleted: [...day.topicsStudied],
      });
    }
  });
  
  return Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
};

// Calculate current streak
const calculateStreak = (dailyProgress: DayProgress[]): number => {
  let streak = 0;
  const sorted = [...dailyProgress].sort((a, b) => b.date.localeCompare(a.date));
  
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].completed) {
      streak++;
    } else {
      break;
    }
  }
  
  return streak;
};

// Try to get userName from localStorage
const getStoredUserName = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('kai-user-name');
    return stored || null;
  } catch {
    return null;
  }
};

interface UIStore {
  userName: string | null;
  setUserName: (name: string | null) => void;
  
  selectedCourseId: string | null;
  setSelectedCourseId: (courseId: string | null) => void;
  
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  
  messages: AIChatMessage[];
  addMessage: (message: AIChatMessage) => void;
  appendStreamChunk: (chunk: string) => void;
  completeLastMessage: () => void;
  clearMessages: () => void;

  calendarEvents: CalendarEvent[];
  addCalendarEvent: (event: CalendarEvent) => void;
  clearCalendarEvents: () => void;
  
  progress: ProgressState;
  completeToday: (minutes: number, topics: string[]) => void;
  addStudyMinutes: (minutes: number) => void;
  fetchProgress: () => Promise<void>;
  progressLoaded: boolean;
  
  audioNotes: AudioNote[];
  addAudioNote: (note: AudioNote) => void;
  
  knowledgeNodes: KnowledgeNode[];
  
  currentCode: string;
  setCurrentCode: (code: string) => void;
}

const initialNodes: KnowledgeNode[] = [
  { id: '1', label: 'C++ Fundamentals', mastery: 85, connections: ['2', '3'], position: [0, 0, 0] },
  { id: '2', label: 'Pointers', mastery: 72, connections: ['1', '4'], position: [2, 1, -1] },
  { id: '3', label: 'Memory Management', mastery: 65, connections: ['1', '4', '5'], position: [-2, 1, 1] },
  { id: '4', label: 'Smart Pointers', mastery: 45, connections: ['2', '3'], position: [1, 2, 2] },
  { id: '5', label: 'RAII', mastery: 38, connections: ['3'], position: [-1, 2, -2] },
  { id: '6', label: 'Templates', mastery: 55, connections: ['1'], position: [3, 0, 1] },
  { id: '7', label: 'STL Containers', mastery: 78, connections: ['6'], position: [4, 1, 0] },
];

const createInitialAudioNotes = (): AudioNote[] => [
  {
    id: '1',
    title: 'Lecture: Pointer Arithmetic',
    duration: 2340,
    timestamp: new Date(Date.now() - 86400000),
    summary: 'Covered pointer arithmetic, array decay, and common pitfalls with dangling pointers.',
    waveformData: Array.from({ length: 50 }, () => Math.random() * 0.8 + 0.2),
  },
  {
    id: '2',
    title: 'Study Session: Smart Pointers',
    duration: 1820,
    timestamp: new Date(Date.now() - 172800000),
    summary: 'Deep dive into unique_ptr, shared_ptr, and weak_ptr. Memory ownership patterns.',
    waveformData: Array.from({ length: 50 }, () => Math.random() * 0.8 + 0.2),
  },
];

const createInitialProgress = (): ProgressState => {
  const dailyProgress = generateSampleDailyProgress();
  const monthlyProgress = generateMonthlyProgress(dailyProgress);
  return {
    currentStreak: calculateStreak(dailyProgress),
    longestStreak: 14,
    activeTopic: 'C++ Pointers',
    completedTopics: ['Variables', 'Functions', 'Classes'],
    dailyProgress,
    monthlyProgress,
    todayCompleted: false,
    todayMinutes: 0,
  };
};

export const useUIStore = create<UIStore>((set) => ({
  userName: getStoredUserName(),
  setUserName: (name) => {
    if (typeof window !== 'undefined') {
      if (name) {
        localStorage.setItem('kai-user-name', name);
      } else {
        localStorage.removeItem('kai-user-name');
      }
    }
    set({ userName: name });
  },
  
  selectedCourseId: null,
  setSelectedCourseId: (courseId) => {
    if (typeof window !== 'undefined') {
      if (courseId) {
        localStorage.setItem('kai-selected-course', courseId);
      } else {
        localStorage.removeItem('kai-selected-course');
      }
    }
    set({ selectedCourseId: courseId });
  },
  
  activeTab: 'commander',
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  messages: [],
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message],
  })),
  appendStreamChunk: (chunk) => set((state) => {
    const messages = [...state.messages];
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant' && lastMessage.isStreaming) {
      messages[messages.length - 1] = {
        ...lastMessage,
        content: lastMessage.content + chunk,
      };
    }
    return { messages };
  }),
  completeLastMessage: () => set((state) => {
    const messages = [...state.messages];
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant') {
      messages[messages.length - 1] = {
        ...lastMessage,
        isStreaming: false,
      };
    }
    return { messages };
  }),
  clearMessages: () => set({ messages: [] }),

  calendarEvents: [],
  addCalendarEvent: (event) => set((state) => {
    const normalized: CalendarEvent = {
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      html_link: event.html_link ?? null,
    };

    const existingIndex = state.calendarEvents.findIndex((item) => {
      if (normalized.id && item.id) return item.id === normalized.id;
      return item.title === normalized.title && item.start === normalized.start && item.end === normalized.end;
    });

    const next = existingIndex >= 0
      ? [
          normalized,
          ...state.calendarEvents.slice(0, existingIndex),
          ...state.calendarEvents.slice(existingIndex + 1),
        ]
      : [normalized, ...state.calendarEvents];

    return { calendarEvents: next.slice(0, 10) };
  }),
  clearCalendarEvents: () => set({ calendarEvents: [] }),
  
  progress: createInitialProgress(),
  progressLoaded: false,

  /**
   * Fetch real progress data from the backend API.
   * Falls back to sample data if the user is not authenticated.
   */
  fetchProgress: async () => {
    // Only fetch if the user has a token (authenticated)
    if (!getToken()) {
      console.log('[Progress] No auth token — using sample data');
      set({ progressLoaded: true });
      return;
    }

    try {
      const data = await getProgress();

      // Map backend snake_case to frontend camelCase
      const dailyProgress: DayProgress[] = data.daily_progress.map((d) => ({
        date: d.date,
        completed: d.completed,
        studyMinutes: d.study_minutes,
        topicsStudied: d.topics_studied,
      }));

      const monthlyProgress: MonthProgress[] = data.monthly_progress.map((m) => ({
        month: m.month,
        daysCompleted: m.days_completed,
        totalDays: m.total_days,
        totalMinutes: m.total_minutes,
        topicsCompleted: m.topics_completed,
      }));

      set({
        progress: {
          currentStreak: data.current_streak,
          longestStreak: data.longest_streak,
          activeTopic: data.active_topic,
          completedTopics: [],  // Could be expanded later
          dailyProgress,
          monthlyProgress,
          todayCompleted: data.today_completed,
          todayMinutes: data.today_minutes,
        },
        progressLoaded: true,
      });

      console.log('[Progress] Loaded from backend API');
    } catch (err) {
      console.warn('[Progress] API fetch failed, using sample data:', err);
      set({ progressLoaded: true });
    }
  },
  
  completeToday: (minutes, topics) => {
    // Fire-and-forget API call if authenticated
    if (getToken()) {
      apiCompleteProgress(minutes, topics).catch((err) =>
        console.warn('[Progress] Failed to sync completion to backend:', err)
      );
    }

    // Optimistic local update
    set((state) => {
      const today = getDateString();
      const updatedDaily = [...state.progress.dailyProgress];
      const todayIndex = updatedDaily.findIndex(d => d.date === today);
      const wasAlreadyCompleted = todayIndex >= 0 ? updatedDaily[todayIndex].completed : false;
      
      if (todayIndex >= 0) {
        updatedDaily[todayIndex] = {
          ...updatedDaily[todayIndex],
          completed: true,
          studyMinutes: updatedDaily[todayIndex].studyMinutes + minutes,
          topicsStudied: [...new Set([...updatedDaily[todayIndex].topicsStudied, ...topics])],
        };
      } else {
        updatedDaily.push({
          date: today,
          completed: true,
          studyMinutes: minutes,
          topicsStudied: topics,
        });
      }
      
      return {
        progress: {
          ...state.progress,
          dailyProgress: updatedDaily,
          monthlyProgress: generateMonthlyProgress(updatedDaily),
          todayCompleted: true,
          todayMinutes: state.progress.todayMinutes + minutes,
          currentStreak: wasAlreadyCompleted ? state.progress.currentStreak : state.progress.currentStreak + 1,
        },
      };
    });
  },
  
  addStudyMinutes: (minutes) => {
    // Fire-and-forget API call if authenticated
    if (getToken()) {
      apiRecordProgress(minutes).catch((err) =>
        console.warn('[Progress] Failed to sync minutes to backend:', err)
      );
    }

    set((state) => {
      const today = getDateString();
      const updatedDaily = [...state.progress.dailyProgress];
      const todayIndex = updatedDaily.findIndex(d => d.date === today);
      
      if (todayIndex >= 0) {
        updatedDaily[todayIndex] = {
          ...updatedDaily[todayIndex],
          studyMinutes: updatedDaily[todayIndex].studyMinutes + minutes,
        };
      }
      
      return {
        progress: {
          ...state.progress,
          dailyProgress: updatedDaily,
          todayMinutes: state.progress.todayMinutes + minutes,
        },
      };
    });
  },
  
  audioNotes: createInitialAudioNotes(),
  addAudioNote: (note) => set((state) => ({
    audioNotes: [note, ...state.audioNotes],
  })),
  
  knowledgeNodes: initialNodes,
  
  currentCode: '#include <iostream>\n#include <memory>\n\nint main() {\n    // Smart pointer example\n    auto ptr = std::make_unique<int>(42);\n    std::cout << "Value: " << *ptr << std::endl;\n    return 0;\n}',
  setCurrentCode: (code) => set({ currentCode: code }),
}));
