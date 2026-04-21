import { ListChecks, Sparkles, Tags, TextQuote } from 'lucide-react';
import { AudioNote } from '../../shared/types';

interface StructuredNotesPanelProps {
  notes?: AudioNote['structuredNotes'] | null;
  transcript?: string;
  compact?: boolean;
}

function BulletList({ items, tone = 'slate' }: { items: string[]; tone?: 'amber' | 'slate' }) {
  const dotClass = tone === 'amber' ? 'bg-amber-400' : 'bg-slate-500';

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={`${item}-${index}`} className="flex items-start gap-3">
          <span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${dotClass}`} />
          <p className="text-xs leading-relaxed text-slate-300">{item}</p>
        </div>
      ))}
    </div>
  );
}

export function StructuredNotesPanel({
  notes,
  transcript,
  compact = false,
}: StructuredNotesPanelProps) {
  if (!notes && !transcript) {
    return null;
  }

  const summary = notes?.summary?.trim();
  const takeaways = notes?.key_takeaways?.filter(Boolean) ?? [];
  const topics = notes?.topics?.filter((topic) => topic.heading && topic.points?.length) ?? [];
  const actionItems = notes?.action_items?.filter(Boolean) ?? [];
  const keywords = notes?.keywords?.filter(Boolean) ?? [];
  const transcriptPreview = transcript?.trim();
  const caption = notes?.scribe_section?.caption ?? 'Bullet-first notes, tuned to your current KAI theme.';
  const label = notes?.scribe_section?.label ?? 'Scribe';

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-amber-500/10 bg-[linear-gradient(135deg,rgba(251,191,36,0.08),rgba(15,23,42,0.35))] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-amber-200">
            <Sparkles size={12} />
            {label}
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-400">{caption}</p>
        </div>
        {notes?.theme?.mood && (
          <div className="rounded-full border border-slate-700/80 bg-slate-950/60 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-400">
            {notes.theme.mood}
          </div>
        )}
      </div>

      {summary && (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300">Summary</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">{summary}</p>
        </div>
      )}

      {takeaways.length > 0 && (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 p-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-amber-300">
            <ListChecks size={13} />
            Key Takeaways
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {takeaways.map((item, index) => (
              <span
                key={`${item}-${index}`}
                className="rounded-full border border-amber-500/15 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {topics.length > 0 && (
        <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'}`}>
          {topics.map((topic, index) => (
            <div
              key={`${topic.heading}-${index}`}
              className="rounded-2xl border border-slate-800/80 bg-slate-950/50 p-4 shadow-[inset_0_1px_0_rgba(251,191,36,0.05)]"
            >
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.22em] text-amber-200">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h4 className="text-sm font-medium text-slate-100">{topic.heading}</h4>
              </div>
              <div className="mt-3">
                <BulletList items={topic.points} tone="amber" />
              </div>
            </div>
          ))}
        </div>
      )}

      {(actionItems.length > 0 || keywords.length > 0) && (
        <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[1.2fr_0.8fr]'}`}>
          {actionItems.length > 0 && (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300">Action Loop</p>
              <div className="mt-3">
                <BulletList items={actionItems} />
              </div>
            </div>
          )}

          {keywords.length > 0 && (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 p-4">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-amber-300">
                <Tags size={13} />
                Focus Words
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {keywords.map((keyword, index) => (
                  <span
                    key={`${keyword}-${index}`}
                    className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-xs text-slate-300"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {transcriptPreview && (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 p-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-400">
            <TextQuote size={13} />
            Transcript Peek
          </div>
          <p className={`mt-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-400 ${compact ? 'line-clamp-5' : ''}`}>
            {transcriptPreview}
          </p>
        </div>
      )}
    </div>
  );
}
