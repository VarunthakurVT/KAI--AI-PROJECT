import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Copy, RotateCcw } from 'lucide-react';
import { useUIStore } from '../../shared/store/useUIStore';

export function CodeEditor() {
  const { currentCode, setCurrentCode } = useUIStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const newCode = currentCode.substring(0, start) + '    ' + currentCode.substring(end);
      setCurrentCode(newCode);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 4;
        }
      }, 0);
    }
  };

  const lineNumbers = currentCode.split('\n').map((_, i) => i + 1);

  return (
    <div className="h-full flex flex-col bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <span className="text-slate-500 text-xs ml-2">main.cpp</span>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => navigator.clipboard.writeText(currentCode)}
          >
            <Copy size={14} />
          </motion.button>
          <motion.button
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <RotateCcw size={14} />
          </motion.button>
          <motion.button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/20 text-emerald-500 text-xs font-medium hover:bg-emerald-500/30 transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Play size={12} />
            Run
          </motion.button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="py-4 px-2 bg-slate-900/30 text-right select-none">
          {lineNumbers.map((num) => (
            <div key={num} className="text-slate-600 text-xs font-mono leading-6 px-2">
              {num}
            </div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          value={currentCode}
          onChange={(e) => setCurrentCode(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 p-4 bg-transparent text-slate-200 font-mono text-sm leading-6 resize-none outline-none"
          spellCheck={false}
        />
      </div>

      <div className="px-4 py-2 border-t border-slate-800 bg-slate-900/30">
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span>C++17</span>
          <span>•</span>
          <span>UTF-8</span>
          <span>•</span>
          <span>{currentCode.split('\n').length} lines</span>
        </div>
      </div>
    </div>
  );
}
