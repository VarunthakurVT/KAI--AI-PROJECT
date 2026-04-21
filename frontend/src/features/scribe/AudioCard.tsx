import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Clock, FileText, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { GlassCard } from '../../shared/ui/GlassCard';
import { TapeVisualizer } from './TapeVisualizer';
import { StructuredNotesPanel } from './StructuredNotesPanel';
import { AudioNote } from '../../shared/types';

interface AudioCardProps {
  note: AudioNote;
  onDelete?: (id: string) => void;
}

export function AudioCard({ note, onDelete }: AudioCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <GlassCard className="p-4" hover>
      <div className="flex items-start gap-4">
        <motion.button
          onClick={() => setIsPlaying(!isPlaying)}
          className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 flex-shrink-0"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-1" />}
        </motion.button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-slate-200 font-medium text-sm truncate">{note.title}</h3>
              {note.structuredNotes?.scribe_section?.label && (
                <div className="mt-2 inline-flex items-center rounded-full border border-amber-500/15 bg-amber-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-amber-200">
                  {note.structuredNotes.scribe_section.label}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <motion.button
                onClick={() => setIsExpanded((value) => !value)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-1 rounded-lg border border-slate-700/70 bg-slate-900/70 px-2.5 py-2 text-[11px] uppercase tracking-[0.2em] text-slate-300 hover:border-amber-500/30 hover:text-amber-200 transition-colors"
                title={isExpanded ? 'Collapse note' : 'Expand note'}
              >
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {isExpanded ? 'Hide' : 'Open'}
              </motion.button>
              {onDelete && (
                <motion.button
                  onClick={() => onDelete(note.id)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  title="Delete note"
                >
                  <Trash2 size={14} />
                </motion.button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {formatDuration(note.duration)}
            </span>
            <span>{formatDate(note.timestamp)}</span>
          </div>

          <div className="mt-3 bg-slate-900/50 rounded-lg overflow-hidden">
            <TapeVisualizer waveformData={note.waveformData} isPlaying={isPlaying} />
          </div>

          <div className="mt-3 flex items-start gap-2">
            <FileText size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
            <p className={`text-xs text-slate-400 leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>
              {note.summary}
            </p>
          </div>

          {isExpanded && (
            <StructuredNotesPanel
              notes={note.structuredNotes}
              transcript={note.transcript}
              compact
            />
          )}
        </div>
      </div>
    </GlassCard>
  );
}
