import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, Bot, User, BookOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useUIStore } from '../../shared/store/useUIStore';
import { GlassCard } from '../../shared/ui/GlassCard';
import { AIChatMessage } from '../../shared/types';
import { chatNonStream } from '../../shared/api/nexusApi';
import { AIResponseCard } from '../../components/AIResponseCard';

// Suggested study topic chips shown below the greeting
const STUDY_SUGGESTIONS = [
  '📚 Explain a concept',
  '🐛 Debug my code',
  '📝 Summarize a topic',
  '🧠 Quiz me',
  '🔍 Deep dive into...',
];

export function ChatCanvas() {
  const { messages, addMessage, appendStreamChunk, completeLastMessage, progress, userName, addCalendarEvent, selectedCourseId } = useUIStore();
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const shouldAutoScrollRef = useRef(true);
  const rafScrollRef = useRef<number | null>(null);
  const greetingShownRef = useRef(false);

  const isNearBottom = () => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceFromBottom < 120;
  };

  const scrollToBottom = () => {
    const end = messagesEndRef.current;
    if (!end) return;
    end.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  useEffect(() => {
    // Only autoscroll if the user hasn't scrolled up to read older messages.
    if (!shouldAutoScrollRef.current) return;
    if (rafScrollRef.current) cancelAnimationFrame(rafScrollRef.current);
    rafScrollRef.current = requestAnimationFrame(() => {
      scrollToBottom();
    });
  }, [messages]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      shouldAutoScrollRef.current = isNearBottom();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    // Initialize state
    shouldAutoScrollRef.current = isNearBottom();
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const handleSuggestionClick = (suggestion: string) => {
    // Strip the emoji prefix
    const text = suggestion.replace(/^[\p{Emoji}\s]+/u, '').trim();
    setInput(text);
    setShowSuggestions(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ── Welcome greeting — shows on every load when no messages ──
  useEffect(() => {
    // React 18 StrictMode runs effects twice in dev; persist a session flag to avoid
    // double-streaming the greeting (which looks like duplicated words).
    const sessionKey = 'kai_greeting_streamed_v1';
    if (greetingShownRef.current) return;
    if (typeof window !== 'undefined' && window.sessionStorage.getItem(sessionKey) === '1') return;
    if (messages.length > 0) return;
    greetingShownRef.current = true;
    if (typeof window !== 'undefined') window.sessionStorage.setItem(sessionKey, '1');

    const displayName = userName || 'there';
    const hour = new Date().getHours();
    const timeGreet =
      hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    const greetingText =
      `${timeGreet}, **${displayName}**! I'm **KAI**, your study buddy. You bring the grind, I bring the genius.\n\n` +
      `What would you like to study today? You can:\n` +
      `• Ask me to **explain** any concept or topic 📖\n` +
      `• Share a **doubt or problem** and I'll help you work through it 🔍\n` +
      `• Request a **quiz** to test your understanding 🧠\n` +
      `• Have me **summarize** or **compare** ideas ✍️\n\n` +
      `Just type your question or pick a suggestion below — I'm ready when you are! 🚀`;

    const greetMsg: AIChatMessage = {
      id: 'greeting-' + Date.now(),
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: new Date(),
    };
    addMessage(greetMsg);

    // Stream the greeting word-by-word for a natural feel
    (async () => {
      const words = greetingText.split(' ');
      for (const word of words) {
        await new Promise<void>((r) => setTimeout(r, 28 + Math.random() * 18));
        appendStreamChunk(word + ' ');
      }
      completeLastMessage();
      setShowSuggestions(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const simulateStream = async (response: string) => {
    const newMessage: AIChatMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: new Date(),
    };
    addMessage(newMessage);

    const words = response.split(' ');
    for (let i = 0; i < words.length; i++) {
      await new Promise((r) => setTimeout(r, 30 + Math.random() * 20));
      appendStreamChunk(words[i] + ' ');
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    setShowSuggestions(false);

    const userMessage: AIChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };
    addMessage(userMessage);
    setInput('');
    setIsTyping(true);

    const assistantMessage: AIChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: new Date(),
    };
    addMessage(assistantMessage);

    try {
      console.log('Sending message:', userMessage.content);
      const response = await chatNonStream(userMessage.content, {
        use_rag: selectedCourseId ? true : false, // Enable RAG if course is selected
        course_id: selectedCourseId || undefined, // Pass selected course to retrieve relevant content
        tooling_mode: true, // Enable agent tools (calendar MCP, etc.)
        user_name: userName || undefined, // Send username to backend
      });

      if (response?.calendar_updated && response?.new_event) {
        addCalendarEvent(response.new_event);
      }

      const text = String(response?.content ?? '');
      const tokens = text.split(/(\s+)/).filter((t: string) => t.length > 0);
      for (const token of tokens) {
        // Small delay for a "streaming" feel without making long replies painful.
        // eslint-disable-next-line no-await-in-loop
        await new Promise<void>((resolve) => setTimeout(resolve, token.trim() ? 14 : 4));
        appendStreamChunk(token);
      }

      completeLastMessage();
      setIsTyping(false);
    } catch (error) {
      console.error('Chat exception:', error);
      let message = 'Unknown error';
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        if (error.message === 'Failed to fetch') {
          message =
            'Unable to reach the KAI backend API. Make sure the backend is running on http://localhost:8000 and that your network allows local requests.';
        } else {
          message = error.message;
        }
      }
      appendStreamChunk(`\n\n**Error**: ${message}`);
      completeLastMessage();
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header with Username & Course */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <User size={16} className="text-amber-500" />
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Chatting with</p>
            <p className="text-sm font-semibold text-amber-400">{userName || 'Guest'}</p>
            {selectedCourseId && (
              <p className="text-xs text-emerald-500 mt-1">📚 Course: {selectedCourseId}</p>
            )}
          </div>
        </div>
        <div className="text-xs text-slate-500">
          {new Date().toLocaleDateString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric' 
          })}
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700 scroll-smooth"
      >
        <AnimatePresence mode="popLayout">
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-amber-500/20 text-amber-500'
                    : msg.role === 'system'
                    ? 'bg-emerald-500/20 text-emerald-500'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              
              {msg.role === 'user' ? (
                <GlassCard
                  className={`max-w-[80%] p-4 bg-amber-500/10 border-amber-500/20`}
                >
                  <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap font-mono">
                    {msg.content}
                  </div>
                </GlassCard>
              ) : msg.formattedResponse ? (
                // Use AIResponseCard for formatted responses
                <AIResponseCard
                  greeting={msg.formattedResponse.greeting}
                  heading={msg.formattedResponse.heading}
                  headingIcon={msg.formattedResponse.heading_icon || '🔗'}
                  content={msg.formattedResponse.content}
                  followup={msg.formattedResponse.followup}
                  followupIcon={msg.formattedResponse.followup_icon || '❓'}
                />
              ) : (
                <GlassCard
                  className={`max-w-[80%] p-4 ${
                    msg.role === 'system'
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : 'bg-slate-800/50'
                  }`}
                >
                  <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-5 mb-3 last:mb-0">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 last:mb-0">{children}</ol>,
                        li: ({ children }) => <li className="mb-1 last:mb-0">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold text-slate-100">{children}</strong>,
                        code: ({ className, children }) => {
                          const isBlock = Boolean(className);
                          if (!isBlock) {
                            return (
                              <code className="px-1.5 py-0.5 rounded bg-slate-900/60 border border-slate-700 font-mono text-[0.85em]">
                                {children}
                              </code>
                            );
                          }
                          return (
                            <code className="block p-3 rounded-lg bg-slate-900/60 border border-slate-700 font-mono text-xs overflow-x-auto">
                              {children}
                            </code>
                          );
                        },
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>

                    {msg.isStreaming && (
                      <motion.span
                        animate={{ opacity: [1, 0] }}
                        transition={{ duration: 0.5, repeat: Infinity }}
                        className="inline-block w-2 h-4 bg-amber-500 ml-1 align-baseline"
                      />
                    )}
                  </div>
                </GlassCard>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
              <Bot size={16} className="text-slate-300" />
            </div>
            <GlassCard className="p-4">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full bg-amber-500"
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </div>
            </GlassCard>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-slate-800 space-y-3">
        {/* Quick suggestion chips */}
        <AnimatePresence>
          {showSuggestions && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="flex flex-wrap gap-2"
            >
              {STUDY_SUGGESTIONS.map((s) => (
                <motion.button
                  key={s}
                  onClick={() => handleSuggestionClick(s)}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:border-amber-500/50 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                >
                  <BookOpen size={11} />
                  {s}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-500 ${
            progress.todayCompleted
              ? 'border-amber-700/50 bg-amber-500/5'
              : 'border-slate-700 bg-slate-900/50'
          }`}
        >
          <Sparkles
            size={20}
            className={progress.todayCompleted ? 'text-amber-500' : 'text-slate-500'}
          />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={`What do you want to study, ${userName || 'there'}? Ask me anything...`}
            className="flex-1 bg-transparent text-slate-200 placeholder-slate-500 outline-none font-mono text-sm"
          />
          <motion.button
            onClick={handleSend}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-2 rounded-lg bg-amber-500/20 text-amber-500 hover:bg-amber-500/30 transition-colors"
          >
            <Send size={18} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
