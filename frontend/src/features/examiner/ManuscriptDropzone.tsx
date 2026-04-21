import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, UploadCloud, X } from 'lucide-react';

interface ManuscriptDropzoneProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export function ManuscriptDropzone({ file, onFileChange }: ManuscriptDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const acceptFile = (incoming: File | null) => {
    if (!incoming) return;
    if (incoming.type !== 'application/pdf' && !incoming.name.toLowerCase().endsWith('.pdf')) {
      return;
    }
    onFileChange(incoming);
  };

  return (
    <div className="space-y-3">
      <motion.button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          acceptFile(event.dataTransfer.files?.[0] ?? null);
        }}
        className={`w-full rounded-2xl border border-dashed px-4 py-6 text-left transition-all ${
          isDragging
            ? 'border-amber-400 bg-amber-500/10'
            : 'border-slate-700 bg-slate-900/60 hover:border-slate-500'
        }`}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300">
            <UploadCloud size={20} />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-semibold text-slate-100">Drop a syllabus PDF here</div>
            <p className="text-xs leading-5 text-slate-400">
              The backend will extract the content and save the generated paper in PostgreSQL.
            </p>
            <div className="text-xs text-slate-500">PDF only. Best for unit notes, syllabi, and chapter outlines.</div>
          </div>
        </div>
      </motion.button>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
      />

      {file ? (
        <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-300">
              <FileText size={16} />
            </div>
            <div>
              <div className="text-sm text-slate-200">{file.name}</div>
              <div className="text-xs text-slate-500">{Math.max(1, Math.round(file.size / 1024))} KB</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onFileChange(null)}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
