import { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Sliders, BookOpen, Clock, Zap, Target } from 'lucide-react';
import { GlassCard } from '../../shared/ui/GlassCard';

interface ExamSettingsProps {
  onGenerate: () => void;
}

export function ExamSettings({ onGenerate }: ExamSettingsProps) {
  const [questionCount, setQuestionCount] = useState(5);
  const [difficulty, setDifficulty] = useState<'mixed' | 'easy' | 'medium' | 'hard'>('mixed');
  const [topics, setTopics] = useState<string[]>(['Pointers', 'Memory Management']);
  const [questionTypes, setQuestionTypes] = useState<string[]>(['mcq', 'code', 'theory']);

  const allTopics = ['Pointers', 'Memory Management', 'Smart Pointers', 'RAII', 'Templates', 'STL', 'OOP', 'Concurrency'];
  const allTypes = [
    { id: 'mcq', label: 'Multiple Choice', icon: BookOpen },
    { id: 'code', label: 'Code Analysis', icon: Zap },
    { id: 'theory', label: 'Theory', icon: Target },
  ];

  const toggleTopic = (topic: string) => {
    setTopics(prev => 
      prev.includes(topic) 
        ? prev.filter(t => t !== topic)
        : [...prev, topic]
    );
  };

  const toggleType = (type: string) => {
    setQuestionTypes(prev => 
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-violet-500" />
          <span className="text-slate-200 text-sm font-medium">Exam Settings</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Question Count */}
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-300">Questions</span>
            <span className="text-sm font-medium text-violet-400">{questionCount}</span>
          </div>
          <input
            type="range"
            min="3"
            max="20"
            value={questionCount}
            onChange={(e) => setQuestionCount(parseInt(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
          />
          <div className="flex justify-between mt-1">
            <span className="text-xs text-slate-600">3</span>
            <span className="text-xs text-slate-600">20</span>
          </div>
        </GlassCard>

        {/* Difficulty */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sliders size={14} className="text-slate-500" />
            <span className="text-sm text-slate-300">Difficulty</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {['mixed', 'easy', 'medium', 'hard'].map((d) => (
              <motion.button
                key={d}
                onClick={() => setDifficulty(d as any)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  difficulty === d
                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                    : 'bg-slate-800/50 text-slate-400 border border-transparent hover:border-slate-700'
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </motion.button>
            ))}
          </div>
        </GlassCard>

        {/* Question Types */}
        <GlassCard className="p-4">
          <span className="text-sm text-slate-300 mb-3 block">Question Types</span>
          <div className="space-y-2">
            {allTypes.map(({ id, label, icon: Icon }) => (
              <motion.button
                key={id}
                onClick={() => toggleType(id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs transition-all ${
                  questionTypes.includes(id)
                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                    : 'bg-slate-800/50 text-slate-400 border border-transparent hover:border-slate-700'
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

        {/* Topics */}
        <GlassCard className="p-4">
          <span className="text-sm text-slate-300 mb-3 block">Topics</span>
          <div className="flex flex-wrap gap-2">
            {allTopics.map((topic) => (
              <motion.button
                key={topic}
                onClick={() => toggleTopic(topic)}
                className={`px-2 py-1 rounded text-xs transition-all ${
                  topics.includes(topic)
                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                    : 'bg-slate-800/50 text-slate-500 border border-transparent hover:text-slate-400'
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {topic}
              </motion.button>
            ))}
          </div>
        </GlassCard>

        {/* Time Estimate */}
        <div className="flex items-center gap-2 px-2">
          <Clock size={14} className="text-slate-500" />
          <span className="text-xs text-slate-500">
            Estimated time: ~{questionCount * 3} minutes
          </span>
        </div>
      </div>

      <div className="p-4 border-t border-slate-800">
        <motion.button
          onClick={onGenerate}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-medium text-sm hover:from-violet-500 hover:to-purple-500 transition-all"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Generate Exam Paper
        </motion.button>
      </div>
    </div>
  );
}
