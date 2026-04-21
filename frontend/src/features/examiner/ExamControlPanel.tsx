import { motion } from 'framer-motion';
import { BookOpen, Brain, FileQuestion, History, Layers3, Sparkles, Zap } from 'lucide-react';

import { type ExamPaperSummary } from '../../shared/api/nexusApi';
import { GlassCard } from '../../shared/ui/GlassCard';
import { ManuscriptDropzone } from './ManuscriptDropzone';

export interface ExaminerSettingsState {
  sourceMode: 'knowledge' | 'pdf';
  title: string;
  previousKnowledge: string;
  topics: string[];
  questionCount: number;
  difficulty: 'mixed' | 'easy' | 'medium' | 'hard';
  questionTypes: string[];
  file: File | null;
}

interface ExamControlPanelProps {
  settings: ExaminerSettingsState;
  onChange: (next: ExaminerSettingsState) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  history: ExamPaperSummary[];
  historyLoading: boolean;
  onSelectPaper: (paperId: string) => void;
}

const allTopics = [
  'Pointers',
  'Memory Management',
  'Smart Pointers',
  'RAII',
  'Templates',
  'STL',
  'OOP',
  'Concurrency',
];

const allTypes = [
  { id: 'mcq', label: 'Multiple Choice', icon: BookOpen },
  { id: 'code', label: 'Code Analysis', icon: Zap },
  { id: 'theory', label: 'Theory', icon: Brain },
];

export function ExamControlPanel({
  settings,
  onChange,
  onGenerate,
  isGenerating,
  history,
  historyLoading,
  onSelectPaper,
}: ExamControlPanelProps) {
  const toggleTopic = (topic: string) => {
    const topics = settings.topics.includes(topic)
      ? settings.topics.filter((item) => item !== topic)
      : [...settings.topics, topic];
    onChange({ ...settings, topics });
  };

  const toggleType = (type: string) => {
    const questionTypes = settings.questionTypes.includes(type)
      ? settings.questionTypes.filter((item) => item !== type)
      : [...settings.questionTypes, type];
    onChange({ ...settings, questionTypes });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950">
      <div className="border-b border-slate-800 bg-slate-900/70 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-300">
            <Layers3 size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100">Exam Control Room</div>
            <div className="text-xs text-slate-500">Choose the source, then generate and save the paper.</div>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <GlassCard className="p-4">
          <div className="mb-3 text-sm font-medium text-slate-200">1. Pick the question source</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'knowledge', label: 'Previous Knowledge' },
              { id: 'pdf', label: 'PDF Manuscript' },
            ].map((option) => (
              <motion.button
                key={option.id}
                type="button"
                onClick={() => onChange({ ...settings, sourceMode: option.id as ExaminerSettingsState['sourceMode'] })}
                className={`rounded-2xl border px-3 py-3 text-left text-sm transition-all ${
                  settings.sourceMode === option.id
                    ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
                }`}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                {option.label}
              </motion.button>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="space-y-3 p-4">
          <label className="block text-sm font-medium text-slate-200">Paper title</label>
          <input
            value={settings.title}
            onChange={(event) => onChange({ ...settings, title: event.target.value })}
            placeholder="Optional custom title"
            className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-amber-400/40"
          />

          {settings.sourceMode === 'knowledge' ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-200">What should the paper test from your previous knowledge?</label>
              <textarea
                value={settings.previousKnowledge}
                onChange={(event) => onChange({ ...settings, previousKnowledge: event.target.value })}
                placeholder="Example: I already know basic pointers, RAII, and memory ownership. Focus on application-heavy questions."
                className="h-32 w-full rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-amber-400/40"
              />
            </div>
          ) : (
            <ManuscriptDropzone
              file={settings.file}
              onFileChange={(file) => onChange({ ...settings, file })}
            />
          )}
        </GlassCard>

        <GlassCard className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-slate-300">Questions</span>
            <span className="text-sm font-semibold text-amber-300">{settings.questionCount}</span>
          </div>
          <input
            type="range"
            min="3"
            max="20"
            value={settings.questionCount}
            onChange={(event) => onChange({ ...settings, questionCount: Number(event.target.value) })}
            className="w-full accent-amber-400"
          />
          <div className="mt-1 flex justify-between text-xs text-slate-500">
            <span>3</span>
            <span>20</span>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="mb-3 text-sm font-medium text-slate-200">Difficulty</div>
          <div className="grid grid-cols-2 gap-2">
            {['mixed', 'easy', 'medium', 'hard'].map((level) => (
              <motion.button
                key={level}
                type="button"
                onClick={() => onChange({ ...settings, difficulty: level as ExaminerSettingsState['difficulty'] })}
                className={`rounded-xl border px-3 py-2 text-xs transition-all ${
                  settings.difficulty === level
                    ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                    : 'border-slate-800 bg-slate-900/50 text-slate-400'
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </motion.button>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="mb-3 text-sm font-medium text-slate-200">Question types</div>
          <div className="space-y-2">
            {allTypes.map(({ id, label, icon: Icon }) => (
              <motion.button
                key={id}
                type="button"
                onClick={() => toggleType(id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-xs transition-all ${
                  settings.questionTypes.includes(id)
                    ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                    : 'border-slate-800 bg-slate-900/50 text-slate-400'
                }`}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <Icon size={14} />
                {label}
              </motion.button>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="mb-3 text-sm font-medium text-slate-200">Focus topics</div>
          <div className="flex flex-wrap gap-2">
            {allTopics.map((topic) => (
              <motion.button
                key={topic}
                type="button"
                onClick={() => toggleTopic(topic)}
                className={`rounded-full border px-3 py-1 text-xs transition-all ${
                  settings.topics.includes(topic)
                    ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                    : 'border-slate-800 bg-slate-900/50 text-slate-400'
                }`}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
              >
                {topic}
              </motion.button>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
            <History size={14} />
            Recent saved papers
          </div>
          <div className="space-y-2">
            {historyLoading ? (
              <div className="text-xs text-slate-500">Loading saved papers...</div>
            ) : history.length === 0 ? (
              <div className="text-xs text-slate-500">No saved papers yet. Generate one and it will appear here.</div>
            ) : (
              history.map((paper) => (
                <button
                  key={paper.id}
                  type="button"
                  onClick={() => onSelectPaper(paper.id)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-3 text-left transition-colors hover:border-slate-600"
                >
                  <div className="text-sm text-slate-200">{paper.title}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {paper.source_label ?? paper.source_mode} • {paper.question_count} questions
                  </div>
                </button>
              ))
            )}
          </div>
        </GlassCard>
      </div>

      <div className="border-t border-slate-800 p-4">
        <motion.button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-semibold text-slate-950 transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >
          {isGenerating ? <Sparkles size={16} className="animate-pulse" /> : <FileQuestion size={16} />}
          {isGenerating ? 'Generating paper...' : 'Generate and Save Paper'}
        </motion.button>
      </div>
    </div>
  );
}
