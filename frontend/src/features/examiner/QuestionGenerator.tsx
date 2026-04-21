import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileQuestion, Shuffle, Clock, CheckCircle2, XCircle, ChevronRight, Sparkles, BookOpen, Code2, Brain } from 'lucide-react';
import { GlassCard } from '../../shared/ui/GlassCard';

interface Question {
  id: string;
  type: 'mcq' | 'code' | 'theory';
  difficulty: 'easy' | 'medium' | 'hard';
  topic: string;
  question: string;
  options?: string[];
  codeSnippet?: string;
  correctAnswer?: number;
  userAnswer?: number | string;
  isAnswered: boolean;
}

const sampleQuestions: Question[] = [
  {
    id: '1',
    type: 'mcq',
    difficulty: 'medium',
    topic: 'Pointers',
    question: 'What is the output of the following code?',
    codeSnippet: `int x = 10;\nint *ptr = &x;\nint **pptr = &ptr;\ncout << **pptr;`,
    options: ['10', 'Address of x', 'Address of ptr', 'Compilation Error'],
    correctAnswer: 0,
    isAnswered: false,
  },
  {
    id: '2',
    type: 'mcq',
    difficulty: 'hard',
    topic: 'Smart Pointers',
    question: 'Which smart pointer should be used when multiple objects need to share ownership of a resource?',
    options: ['std::unique_ptr', 'std::shared_ptr', 'std::weak_ptr', 'std::auto_ptr'],
    correctAnswer: 1,
    isAnswered: false,
  },
  {
    id: '3',
    type: 'code',
    difficulty: 'medium',
    topic: 'Memory Management',
    question: 'Identify the memory leak in this code and explain how to fix it:',
    codeSnippet: `void processData() {\n    int* arr = new int[100];\n    if (someCondition()) {\n        return; // Early return\n    }\n    delete[] arr;\n}`,
    isAnswered: false,
  },
  {
    id: '4',
    type: 'mcq',
    difficulty: 'easy',
    topic: 'C++ Basics',
    question: 'What does the `&` operator do when used in a variable declaration?',
    options: ['Bitwise AND operation', 'Creates a reference', 'Gets the address', 'Logical AND operation'],
    correctAnswer: 1,
    isAnswered: false,
  },
  {
    id: '5',
    type: 'theory',
    difficulty: 'hard',
    topic: 'RAII',
    question: 'Explain the RAII (Resource Acquisition Is Initialization) pattern and provide an example of how it helps prevent resource leaks.',
    isAnswered: false,
  },
];

export function QuestionGenerator() {
  const [questions, setQuestions] = useState<Question[]>(sampleQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [textAnswer, setTextAnswer] = useState('');

  const currentQuestion = questions[currentIndex];
  const answeredCount = questions.filter(q => q.isAnswered).length;
  const correctCount = questions.filter(q => q.isAnswered && q.userAnswer === q.correctAnswer).length;

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'text-emerald-500 bg-emerald-500/10';
      case 'medium': return 'text-amber-500 bg-amber-500/10';
      case 'hard': return 'text-red-500 bg-red-500/10';
      default: return 'text-slate-500 bg-slate-500/10';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'mcq': return BookOpen;
      case 'code': return Code2;
      case 'theory': return Brain;
      default: return FileQuestion;
    }
  };

  const handleAnswer = (answerIndex: number) => {
    if (currentQuestion.isAnswered) return;
    
    const updated = [...questions];
    updated[currentIndex] = {
      ...updated[currentIndex],
      userAnswer: answerIndex,
      isAnswered: true,
    };
    setQuestions(updated);
    setShowResult(true);
    
    setTimeout(() => {
      setShowResult(false);
      if (currentIndex < questions.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
    }, 1500);
  };

  const handleTextSubmit = () => {
    if (!textAnswer.trim() || currentQuestion.isAnswered) return;
    
    const updated = [...questions];
    updated[currentIndex] = {
      ...updated[currentIndex],
      userAnswer: textAnswer,
      isAnswered: true,
    };
    setQuestions(updated);
    setTextAnswer('');
    
    if (currentIndex < questions.length - 1) {
      setTimeout(() => setCurrentIndex(currentIndex + 1), 500);
    }
  };

  const regenerateQuestions = async () => {
    setIsGenerating(true);
    await new Promise(r => setTimeout(r, 2000));
    setQuestions(sampleQuestions.map(q => ({ ...q, isAnswered: false, userAnswer: undefined })));
    setCurrentIndex(0);
    setIsGenerating(false);
  };

  const TypeIcon = getTypeIcon(currentQuestion.type);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <FileQuestion size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-slate-200 font-semibold">Exam Generator</h2>
            <p className="text-slate-500 text-xs">AI-powered question paper</p>
          </div>
        </div>
        <motion.button
          onClick={regenerateQuestions}
          disabled={isGenerating}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/20 text-violet-400 text-sm font-medium hover:bg-violet-500/30 transition-colors disabled:opacity-50"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {isGenerating ? (
            <>
              <Sparkles size={16} className="animate-pulse" />
              Generating...
            </>
          ) : (
            <>
              <Shuffle size={16} />
              New Paper
            </>
          )}
        </motion.button>
      </div>

      {/* Progress Bar */}
      <div className="px-4 py-3 border-b border-slate-800/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500">Progress</span>
          <span className="text-xs text-slate-400">{answeredCount}/{questions.length} answered</span>
        </div>
        <div className="flex gap-1">
          {questions.map((q, i) => (
            <motion.button
              key={q.id}
              onClick={() => setCurrentIndex(i)}
              className={`flex-1 h-2 rounded-full transition-all ${
                i === currentIndex
                  ? 'bg-violet-500'
                  : q.isAnswered
                  ? q.userAnswer === q.correctAnswer || q.type !== 'mcq'
                    ? 'bg-emerald-500/60'
                    : 'bg-red-500/60'
                  : 'bg-slate-700'
              }`}
              whileHover={{ scale: 1.1 }}
            />
          ))}
        </div>
      </div>

      {/* Question Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestion.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {/* Question Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 text-sm">Q{currentIndex + 1}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getDifficultyColor(currentQuestion.difficulty)}`}>
                  {currentQuestion.difficulty}
                </span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-400">
                  <TypeIcon size={12} />
                  {currentQuestion.type.toUpperCase()}
                </span>
              </div>
              <div className="flex-1" />
              <span className="text-xs text-slate-500">{currentQuestion.topic}</span>
            </div>

            {/* Question Text */}
            <GlassCard className="p-5 mb-4">
              <p className="text-slate-200 leading-relaxed">{currentQuestion.question}</p>
              
              {currentQuestion.codeSnippet && (
                <div className="mt-4 p-4 rounded-lg bg-slate-900 border border-slate-800 font-mono text-sm">
                  <pre className="text-slate-300 whitespace-pre-wrap">
                    {currentQuestion.codeSnippet}
                  </pre>
                </div>
              )}
            </GlassCard>

            {/* Answer Options */}
            {currentQuestion.type === 'mcq' && currentQuestion.options && (
              <div className="space-y-3">
                {currentQuestion.options.map((option, i) => {
                  const isSelected = currentQuestion.userAnswer === i;
                  const isCorrect = currentQuestion.correctAnswer === i;
                  const showCorrectness = currentQuestion.isAnswered;
                  
                  return (
                    <motion.button
                      key={i}
                      onClick={() => handleAnswer(i)}
                      disabled={currentQuestion.isAnswered}
                      className={`w-full p-4 rounded-xl border text-left transition-all ${
                        showCorrectness
                          ? isCorrect
                            ? 'border-emerald-500/50 bg-emerald-500/10'
                            : isSelected
                            ? 'border-red-500/50 bg-red-500/10'
                            : 'border-slate-800 bg-slate-900/30'
                          : 'border-slate-800 bg-slate-900/30 hover:border-violet-500/50 hover:bg-violet-500/5'
                      }`}
                      whileHover={!currentQuestion.isAnswered ? { scale: 1.01 } : undefined}
                      whileTap={!currentQuestion.isAnswered ? { scale: 0.99 } : undefined}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium ${
                          showCorrectness
                            ? isCorrect
                              ? 'bg-emerald-500/20 text-emerald-500'
                              : isSelected
                              ? 'bg-red-500/20 text-red-500'
                              : 'bg-slate-800 text-slate-400'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {showCorrectness ? (
                            isCorrect ? <CheckCircle2 size={16} /> : isSelected ? <XCircle size={16} /> : String.fromCharCode(65 + i)
                          ) : (
                            String.fromCharCode(65 + i)
                          )}
                        </div>
                        <span className={`${
                          showCorrectness && isCorrect ? 'text-emerald-400' : 
                          showCorrectness && isSelected && !isCorrect ? 'text-red-400' : 
                          'text-slate-300'
                        }`}>
                          {option}
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}

            {/* Text Answer for Theory/Code */}
            {(currentQuestion.type === 'theory' || currentQuestion.type === 'code') && (
              <div className="space-y-3">
                {currentQuestion.isAnswered ? (
                  <GlassCard className="p-4 border-emerald-500/30 bg-emerald-500/5">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 size={16} className="text-emerald-500" />
                      <span className="text-emerald-400 text-sm font-medium">Answer Submitted</span>
                    </div>
                    <p className="text-slate-400 text-sm">{currentQuestion.userAnswer as string}</p>
                  </GlassCard>
                ) : (
                  <>
                    <textarea
                      value={textAnswer}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      placeholder={currentQuestion.type === 'code' ? 'Explain the issue and provide the fix...' : 'Write your answer here...'}
                      className="w-full h-40 p-4 rounded-xl bg-slate-900/50 border border-slate-800 text-slate-200 placeholder-slate-500 resize-none outline-none focus:border-violet-500/50 transition-colors font-mono text-sm"
                    />
                    <motion.button
                      onClick={handleTextSubmit}
                      disabled={!textAnswer.trim()}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/20 text-violet-400 text-sm font-medium hover:bg-violet-500/30 transition-colors disabled:opacity-50"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Submit Answer
                      <ChevronRight size={16} />
                    </motion.button>
                  </>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer Stats */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-slate-500" />
              <span className="text-xs text-slate-400">~15 min</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-500" />
              <span className="text-xs text-slate-400">{correctCount} correct</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-30"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <ChevronRight size={16} className="rotate-180" />
            </motion.button>
            <span className="text-xs text-slate-500">{currentIndex + 1} / {questions.length}</span>
            <motion.button
              onClick={() => setCurrentIndex(Math.min(questions.length - 1, currentIndex + 1))}
              disabled={currentIndex === questions.length - 1}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-30"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <ChevronRight size={16} />
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
