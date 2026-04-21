import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bug, Send, Lightbulb, AlertTriangle } from 'lucide-react';
import { GlassCard } from '../../shared/ui/GlassCard';

interface DebugMessage {
  id: string;
  type: 'error' | 'suggestion' | 'info';
  content: string;
}

export function DebugChat() {
  const [messages] = useState<DebugMessage[]>([
    {
      id: '1',
      type: 'info',
      content: 'Code analysis ready. Run your code or ask for help with debugging.',
    },
    {
      id: '2',
      type: 'suggestion',
      content: 'Consider using std::make_unique instead of raw new for better exception safety.',
    },
  ]);
  const [input, setInput] = useState('');

  const getIcon = (type: DebugMessage['type']) => {
    switch (type) {
      case 'error':
        return <AlertTriangle size={14} className="text-red-500" />;
      case 'suggestion':
        return <Lightbulb size={14} className="text-amber-500" />;
      default:
        return <Bug size={14} className="text-blue-500" />;
    }
  };

  const getBgColor = (type: DebugMessage['type']) => {
    switch (type) {
      case 'error':
        return 'bg-red-500/10 border-red-500/20';
      case 'suggestion':
        return 'bg-amber-500/10 border-amber-500/20';
      default:
        return 'bg-blue-500/10 border-blue-500/20';
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <Bug size={16} className="text-amber-500" />
          <span className="text-slate-200 text-sm font-medium">Debug Assistant</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <GlassCard className={`p-3 ${getBgColor(msg.type)}`}>
              <div className="flex items-start gap-2">
                {getIcon(msg.type)}
                <p className="text-xs text-slate-300 leading-relaxed">{msg.content}</p>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      <div className="p-3 border-t border-slate-800">
        <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/50 border border-slate-800">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your code..."
            className="flex-1 bg-transparent text-slate-200 text-xs placeholder-slate-500 outline-none"
          />
          <motion.button
            className="p-1.5 rounded-md bg-amber-500/20 text-amber-500"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Send size={12} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
