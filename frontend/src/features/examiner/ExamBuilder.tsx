import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronRight,
  Code2,
  FileQuestion,
  Loader2,
  XCircle,
} from 'lucide-react';

import { type ExamPaper } from '../../shared/api/nexusApi';
import { GlassCard } from '../../shared/ui/GlassCard';

interface ExamBuilderProps {
  paper: ExamPaper | null;
  isLoading: boolean;
  error: string | null;
  sourceMode: 'knowledge' | 'pdf';
}

export function ExamBuilder({ paper, isLoading, error, sourceMode }: ExamBuilderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [draftAnswer, setDraftAnswer] = useState('');

  useEffect(() => {
    setCurrentIndex(0);
    setAnswers({});
    setDraftAnswer('');
  }, [paper?.id]);

  const currentQuestion = paper?.questions[currentIndex] ?? null;
  const answeredCount = useMemo(
    () => (paper ? paper.questions.filter((question) => answers[question.id] !== undefined).length : 0),
    [paper, answers],
  );

  const getTypeIcon = (type: 'mcq' | 'code' | 'theory') => {
    switch (type) {
      case 'mcq':
        return BookOpen;
      case 'code':
        return Code2;
      case 'theory':
        return Brain;
    }
  };

  const getDifficultyClasses = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-emerald-500/10 text-emerald-300';
      case 'medium':
        return 'bg-amber-500/10 text-amber-300';
      case 'hard':
        return 'bg-rose-500/10 text-rose-300';
      default:
        return 'bg-slate-800 text-slate-300';
    }
  };

  const submitTextAnswer = () => {
    if (!currentQuestion || !draftAnswer.trim()) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: draftAnswer.trim() }));
    setDraftAnswer('');
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <GlassCard className="w-full max-w-xl p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-amber-500/10 text-amber-300">
            <Loader2 size={26} className="animate-spin" />
          </div>
          <h2 className="text-xl font-semibold text-slate-100">Building your exam paper</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            {sourceMode === 'pdf'
              ? 'Uploading the PDF, extracting the content, and generating questions.'
              : 'Turning your previous knowledge notes into a saved practice paper.'}
          </p>
        </GlassCard>
      </div>
    );
  }

  if (!paper) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <GlassCard className="w-full max-w-3xl p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-300">
              <FileQuestion size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-slate-100">Examiner is ready</h2>
              <p className="text-sm text-slate-500">
                First choose whether the paper should come from previous knowledge or a PDF manuscript.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="text-sm font-semibold text-slate-100">Previous knowledge mode</div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Best when you already know the topic and want quick revision questions from your own notes or focus areas.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="text-sm font-semibold text-slate-100">PDF manuscript mode</div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Best when you want to upload a syllabus PDF and generate questions directly from that content.
              </p>
            </div>
          </div>

          {error ? (
            <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}
        </GlassCard>
      </div>
    );
  }

  if (!currentQuestion) {
    return null;
  }

  const TypeIcon = getTypeIcon(currentQuestion.type);
  const userAnswer = answers[currentQuestion.id];
  const isMcqAnswered = typeof userAnswer === 'number';
  const isTextAnswered = typeof userAnswer === 'string';

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-800 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-300">
                <FileQuestion size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-100">{paper.title}</h2>
                <p className="text-xs text-slate-500">
                  {paper.source_label ?? paper.source_mode} • {paper.question_count} questions • saved to database
                </p>
              </div>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>{answeredCount}/{paper.questions.length} answered</div>
            <div>{new Date(paper.created_at).toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-800/70 px-5 py-3">
        <div className="flex gap-2">
          {paper.questions.map((question, index) => (
            <button
              key={question.id}
              type="button"
              onClick={() => setCurrentIndex(index)}
              className={`h-2 flex-1 rounded-full transition-all ${
                currentIndex === index
                  ? 'bg-amber-400'
                  : answers[question.id] !== undefined
                    ? 'bg-emerald-500/70'
                    : 'bg-slate-800'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestion.id}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.2 }}
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-500">Q{currentIndex + 1}</span>
              <span className={`rounded-full px-3 py-1 text-xs ${getDifficultyClasses(currentQuestion.difficulty)}`}>
                {currentQuestion.difficulty}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                <TypeIcon size={12} />
                {currentQuestion.type.toUpperCase()}
              </span>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">{currentQuestion.topic}</span>
            </div>

            <GlassCard className="mb-4 p-5">
              <div className="text-lg leading-8 text-slate-100">{currentQuestion.question}</div>
              {currentQuestion.source_excerpt ? (
                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm leading-6 text-slate-400">
                  <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">Source cue</div>
                  {currentQuestion.source_excerpt}
                </div>
              ) : null}
            </GlassCard>

            {currentQuestion.type === 'mcq' ? (
              <div className="space-y-3">
                {currentQuestion.options.map((option, optionIndex) => {
                  const isSelected = userAnswer === optionIndex;
                  const isCorrect = currentQuestion.correct_answer === optionIndex;
                  const isAnswered = isMcqAnswered;
                  return (
                    <motion.button
                      key={`${currentQuestion.id}-${optionIndex}`}
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, [currentQuestion.id]: optionIndex }))}
                      disabled={isAnswered}
                      className={`w-full rounded-2xl border p-4 text-left transition-all ${
                        isAnswered
                          ? isCorrect
                            ? 'border-emerald-500/40 bg-emerald-500/10'
                            : isSelected
                              ? 'border-rose-500/40 bg-rose-500/10'
                              : 'border-slate-800 bg-slate-900/50'
                          : 'border-slate-800 bg-slate-900/50 hover:border-amber-400/30'
                      }`}
                      whileHover={!isAnswered ? { scale: 1.01 } : undefined}
                      whileTap={!isAnswered ? { scale: 0.99 } : undefined}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-800 text-xs text-slate-300">
                          {isAnswered ? (
                            isCorrect ? <CheckCircle2 size={16} className="text-emerald-300" /> : isSelected ? <XCircle size={16} className="text-rose-300" /> : String.fromCharCode(65 + optionIndex)
                          ) : (
                            String.fromCharCode(65 + optionIndex)
                          )}
                        </div>
                        <span className="text-sm text-slate-200">{option}</span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                {isTextAnswered ? (
                  <GlassCard className="space-y-3 border border-emerald-500/30 bg-emerald-500/5 p-4">
                    <div className="text-sm font-semibold text-emerald-200">Your answer</div>
                    <p className="text-sm leading-6 text-slate-200">{userAnswer}</p>
                  </GlassCard>
                ) : (
                  <>
                    <textarea
                      value={draftAnswer}
                      onChange={(event) => setDraftAnswer(event.target.value)}
                      placeholder={currentQuestion.type === 'code' ? 'Write your approach or pseudocode here...' : 'Write your answer here...'}
                      className="h-40 w-full rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-amber-400/40"
                    />
                    <motion.button
                      type="button"
                      onClick={submitTextAnswer}
                      disabled={!draftAnswer.trim()}
                      className="flex items-center gap-2 rounded-xl bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-200 transition-colors disabled:opacity-50"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      Submit answer
                      <ChevronRight size={14} />
                    </motion.button>
                  </>
                )}
              </div>
            )}

            {answers[currentQuestion.id] !== undefined && currentQuestion.answer_guide ? (
              <GlassCard className="mt-4 border border-slate-800 p-4">
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">Answer guide</div>
                <p className="text-sm leading-6 text-slate-300">{currentQuestion.answer_guide}</p>
              </GlassCard>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="border-t border-slate-800 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Paper backend: {String(paper.metadata.generation_backend ?? 'local')}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
              disabled={currentIndex === 0}
              className="rounded-xl border border-slate-800 px-3 py-2 text-xs text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setCurrentIndex((value) => Math.min(paper.questions.length - 1, value + 1))}
              disabled={currentIndex === paper.questions.length - 1}
              className="rounded-xl border border-slate-800 px-3 py-2 text-xs text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
