export interface FormattedAIResponse {
  greeting: string;
  heading: string;
  heading_icon?: string;
  content: string;
  followup: string;
  followup_icon?: string;
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'system' | 'assistant';
  content: string;
  isStreaming?: boolean;
  timestamp?: Date;
  formattedResponse?: FormattedAIResponse;
}

export interface CalendarEvent {
  id?: string;
  title: string;
  start: string; // ISO datetime
  end: string; // ISO datetime
  html_link?: string | null;
}

export interface DayProgress {
  date: string; // YYYY-MM-DD
  completed: boolean;
  studyMinutes: number;
  topicsStudied: string[];
}

export interface MonthProgress {
  month: string; // YYYY-MM
  daysCompleted: number;
  totalDays: number;
  totalMinutes: number;
  topicsCompleted: string[];
}

export interface ProgressState {
  currentStreak: number;
  longestStreak: number;
  activeTopic: string;
  completedTopics: string[];
  dailyProgress: DayProgress[];
  monthlyProgress: MonthProgress[];
  todayCompleted: boolean;
  todayMinutes: number;
}

export interface AudioNote {
  id: string;
  title: string;
  duration: number;
  timestamp: Date;
  summary: string;
  waveformData: number[];
  transcript?: string;
  structuredNotes?: {
    title: string;
    summary: string;
    topics: Array<{ heading: string; points: string[] }>;
    key_takeaways?: string[];
    action_items?: string[];
    keywords?: string[];
    scribe_section?: {
      label?: string;
      caption?: string;
    };
    theme?: {
      accent?: string;
      mood?: string;
      layout?: string;
    };
  };
}

export interface KnowledgeNode {
  id: string;
  label: string;
  mastery: number;
  connections: string[];
  position: [number, number, number];
}

export interface CodeSession {
  id: string;
  language: string;
  code: string;
  output?: string;
  errors?: string[];
}
