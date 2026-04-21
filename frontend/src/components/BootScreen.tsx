import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useUIStore } from '../shared/store/useUIStore';
import { getScribeGroqConfig, listScribeFolders, waitForApiHealth } from '../shared/api/nexusApi';

interface BootScreenProps {
  onComplete: () => void;
}

export function BootScreen({ onComplete }: BootScreenProps) {
  const { userName, fetchProgress } = useUIStore();
  const [currentLine, setCurrentLine] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [showCursor, setShowCursor] = useState(true);
  const [completedLines, setCompletedLines] = useState<string[]>([]);
  const [apiReady, setApiReady] = useState(false);
  const [apiFailed, setApiFailed] = useState(false);
  const [scribeReady, setScribeReady] = useState(false);

  const bootMessages = useMemo(() => ([
    'Initializing KAI core...',
    'Loading neural pathways...',
    'Calibrating learning algorithms...',
    'Syncing knowledge graph...',
    `Authenticating user: ${userName || 'Student'}...`,
    'System ready.',
  ]), [userName]);

  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 500);
    return () => clearInterval(cursorInterval);
  }, []);

  // Ensure backend API is healthy before entering the app.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await waitForApiHealth({ timeoutMs: 30_000, intervalMs: 800 });
        if (!cancelled) setApiReady(true);
      } catch (err) {
        console.error('API health check failed during boot:', err);
        if (!cancelled) setApiFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (currentLine >= bootMessages.length) return;

    const message = bootMessages[currentLine];
    let charIndex = 0;
    setDisplayedText('');

    const typeInterval = setInterval(() => {
      charIndex++;
      if (charIndex <= message.length) {
        setDisplayedText(message.slice(0, charIndex));
      } else {
        clearInterval(typeInterval);
        setCompletedLines(prev => [...prev, message]);
        setTimeout(() => {
          setCurrentLine(prev => prev + 1);
          setDisplayedText('');
        }, 200);
      }
    }, 25);

    return () => clearInterval(typeInterval);
  }, [bootMessages, currentLine]);

  useEffect(() => {
    if (!apiReady) return;
    if (currentLine < bootMessages.length) return;
    if (!scribeReady) return;
    const timer = setTimeout(onComplete, 600);
    return () => clearTimeout(timer);
  }, [apiReady, currentLine, onComplete, bootMessages.length, scribeReady]);

  // Warm up heavier feature endpoints (Scribe, Progress) during boot.
  useEffect(() => {
    if (!apiReady) return;

    let cancelled = false;
    (async () => {
      try {
        await Promise.allSettled([
          // Scribe warm-up: avoids first-click latency on folder list / config.
          getScribeGroqConfig(),
          listScribeFolders(),
          // Progress warm-up: reduces initial analytics lag in dashboard.
          fetchProgress(),
        ]);
      } finally {
        if (!cancelled) setScribeReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiReady, fetchProgress]);

  return (
    <div className="fixed inset-0 bg-slate-950 flex items-center justify-center">
      <div className="w-full max-w-xl p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-8 flex items-center gap-4"
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <span className="text-white font-bold text-3xl">K</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-200">KAI</h1>
            <p className="text-slate-500">Adaptive Learning System</p>
          </div>
        </motion.div>

        <div className="font-mono text-sm space-y-2 min-h-[180px]">
          {completedLines.map((msg, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-emerald-500">✓</span>
              <span className="text-slate-400">{msg}</span>
            </div>
          ))}
          
          {currentLine >= bootMessages.length && !apiReady && (
            <div className="flex items-center gap-2">
              <span className={apiFailed ? 'text-rose-400' : 'text-amber-500'}>›</span>
              <span className="text-slate-200">
                {apiFailed ? 'Backend API not reachable. Start the backend and reload.' : 'Waiting for backend API…'}
                <span
                  className={`inline-block w-2 h-4 bg-amber-500 ml-0.5 align-middle ${
                    showCursor ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </span>
            </div>
          )}

          {currentLine >= bootMessages.length && apiReady && !scribeReady && (
            <div className="flex items-center gap-2">
              <span className="text-amber-500">›</span>
              <span className="text-slate-200">
                Warming up Scribe & analytics…
                <span
                  className={`inline-block w-2 h-4 bg-amber-500 ml-0.5 align-middle ${
                    showCursor ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </span>
            </div>
          )}

          {currentLine < bootMessages.length && (
            <div className="flex items-center gap-2">
              <span className="text-amber-500">›</span>
              <span className="text-slate-200">
                {displayedText}
                <span
                  className={`inline-block w-2 h-4 bg-amber-500 ml-0.5 align-middle ${
                    showCursor ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </span>
            </div>
          )}
        </div>

        <div className="mt-8 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full"
            initial={{ width: '0%' }}
            animate={{ width: `${Math.min(100, (currentLine / bootMessages.length) * 100)}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
      </div>
    </div>
  );
}
