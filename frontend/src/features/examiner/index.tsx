import { useEffect, useState } from 'react';

import {
  generateExamPaper,
  getExamPaper,
  listExamPapers,
  type ExamPaper,
  type ExamPaperSummary,
} from '../../shared/api/nexusApi';
import { ExamBuilder } from './ExamBuilder';
import { ExamControlPanel, type ExaminerSettingsState } from './ExamControlPanel';

const initialSettings: ExaminerSettingsState = {
  sourceMode: 'knowledge',
  title: '',
  previousKnowledge: '',
  topics: ['Pointers', 'Memory Management'],
  questionCount: 6,
  difficulty: 'mixed',
  questionTypes: ['mcq', 'code', 'theory'],
  file: null,
};

export function Examiner() {
  const [settings, setSettings] = useState<ExaminerSettingsState>(initialSettings);
  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [history, setHistory] = useState<ExamPaperSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshHistory = async () => {
    try {
      const papers = await listExamPapers();
      setHistory(papers);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    void refreshHistory();
  }, []);

  const handleGenerate = async () => {
    setError(null);

    if (settings.sourceMode === 'pdf' && !settings.file) {
      setError('Choose a PDF before generating a manuscript-based paper.');
      return;
    }

    if (settings.sourceMode === 'knowledge' && !settings.previousKnowledge.trim() && settings.topics.length === 0) {
      setError('Add previous knowledge notes or choose at least one focus topic.');
      return;
    }

    setIsGenerating(true);
    try {
      const nextPaper = await generateExamPaper({
        sourceMode: settings.sourceMode,
        title: settings.title,
        previousKnowledge: settings.previousKnowledge,
        topics: settings.topics,
        questionCount: settings.questionCount,
        difficulty: settings.difficulty,
        questionTypes: settings.questionTypes,
        file: settings.file,
      });
      setPaper(nextPaper);
      setSettings((prev) => ({ ...prev, file: null }));
      await refreshHistory();
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Could not generate the exam paper.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectPaper = async (paperId: string) => {
    setError(null);
    try {
      const selectedPaper = await getExamPaper(paperId);
      setPaper(selectedPaper);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the saved paper.');
    }
  };

  return (
    <div className="flex h-full gap-4 p-4">
      <div className="h-full w-full flex-1 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950">
        <ExamBuilder paper={paper} isLoading={isGenerating} error={error} sourceMode={settings.sourceMode} />
      </div>
      <div className="h-full w-[22rem]">
        <ExamControlPanel
          settings={settings}
          onChange={setSettings}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          history={history}
          historyLoading={historyLoading}
          onSelectPaper={handleSelectPaper}
        />
      </div>
    </div>
  );
}
