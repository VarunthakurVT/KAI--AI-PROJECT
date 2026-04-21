import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Mic,
  Upload,
  Wand2,
  Square,
  Loader2,
  FileAudio,
  CheckCircle2,
  FolderPlus,
  Trash2,
  Plus,
  PencilLine,
  Sparkles,
} from 'lucide-react';
import { GlassCard } from '../../shared/ui/GlassCard';
import { AudioCard } from './AudioCard';
import { StructuredNotesPanel } from './StructuredNotesPanel';
import {
  createScribeFolder,
  createScribeGroqNoteFromAudio,
  createScribeGroqNoteFromAudioStream,
  createScribeGroqNoteFromChat,
  deleteScribeFolder,
  deleteScribeNote,
  listScribeFolders,
  listScribeNotes,
  ScribeFolder,
  ScribeNote,
  ScribeNotes,
  StreamProgress,
} from '../../shared/api/nexusApi';
import { AudioNote } from '../../shared/types';

export function Scribe() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const fileHashCacheRef = useRef<Map<string, { transcript: string; notes: ScribeNotes | null }>>(new Map());

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0); // 0-100
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastNotes, setLastNotes] = useState<ScribeNotes | null>(null);

  const [folders, setFolders] = useState<ScribeFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [notes, setNotes] = useState<ScribeNote[]>([]);
  const [chatPrompt, setChatPrompt] = useState('');

  const canRecord = useMemo(
    () => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
    [],
  );

  const generateWaveform = (count = 50) =>
    Array.from({ length: count }, () => Math.random() * 0.8 + 0.2);

  const refreshFolders = async () => {
    const nextFolders = await listScribeFolders();
    setFolders(nextFolders);
    if (!selectedFolderId) {
      setSelectedFolderId(nextFolders[0]?.id ?? null);
    } else if (nextFolders.length > 0 && !nextFolders.some((item) => item.id === selectedFolderId)) {
      setSelectedFolderId(nextFolders[0].id);
    }
  };

  const refreshNotes = async (folderId: string | null) => {
    const nextNotes = await listScribeNotes(folderId);
    setNotes(nextNotes);
  };

  useEffect(() => {
    (async () => {
      try {
        await refreshFolders();
      } catch (error) {
        console.error('Failed to load folders:', error);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refreshNotes(selectedFolderId);
      } catch (error) {
        console.error('Failed to load notes:', error);
      }
    })();
  }, [selectedFolderId]);

  const noteToAudioNote = (note: ScribeNote): AudioNote => ({
    id: note.id,
    title: note.title,
    duration: note.duration_seconds ?? 0,
    timestamp: new Date(note.created_at),
    summary: note.summary ?? '',
    waveformData: generateWaveform(),
    transcript: note.transcript ?? undefined,
    structuredNotes: note.structured_notes ?? undefined,
  });

  // Get current folder name
  const currentFolder = folders.find((f) => f.id === selectedFolderId);
  const folderName = currentFolder?.name || 'All Notes';
  const noteCount = notes.length;

  const processAudioFile = async (file: File) => {
    // Simple cache key based on file characteristics
    const cacheKey = `${file.name}_${file.size}`;
    const cached = fileHashCacheRef.current.get(cacheKey);
    
    if (cached) {
      // Use cached result
      setLastTranscript(cached.transcript);
      setLastNotes(cached.notes);
      setStatusText('✅ Loaded from cache!');
      setUploadProgress(100);
      setTimeout(() => setStatusText(null), 1200);
      return;
    }

    setIsProcessing(true);
    setUploadProgress(0);
    setStatusText('📤 Starting upload...');
    setLastTranscript('');
    setLastNotes(null);

    try {
      // Try streaming API first for real-time chunk processing
      try {
        const created = await createScribeGroqNoteFromAudioStream(
          selectedFolderId,
          file,
          (progress) => {
            setUploadProgress(progress.progress);
            const emoji = progress.phase === 'uploading' ? '📤' : 
                         progress.phase === 'transcribing' ? '🎙️' :
                         progress.phase === 'structuring' ? '✨' : '✅';
            setStatusText(`${emoji} ${progress.message}`);
          }
        );

        setLastTranscript(created.transcript || '');
        setLastNotes(created.structured_notes);

        // Cache the result
        fileHashCacheRef.current.set(cacheKey, {
          transcript: created.transcript || '',
          notes: created.structured_notes || null,
        });

        await refreshNotes(selectedFolderId);
        setStatusText('✅ Complete!');
        setUploadProgress(100);
        setTimeout(() => setStatusText(null), 1200);
      } catch (streamError) {
        // Fallback to traditional upload if streaming fails
        console.warn('Streaming upload failed, falling back to standard upload', streamError);
        setStatusText('📤 Using standard upload...');
        setUploadProgress(30);
        
        const created = await createScribeGroqNoteFromAudio(selectedFolderId, file);
        setLastTranscript(created.transcript || '');
        setLastNotes(created.structured_notes);

        // Cache the result
        fileHashCacheRef.current.set(cacheKey, {
          transcript: created.transcript || '',
          notes: created.structured_notes || null,
        });

        await refreshNotes(selectedFolderId);
        setStatusText('✅ Complete!');
        setUploadProgress(100);
        setTimeout(() => setStatusText(null), 1200);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Audio processing error:', message);
      setStatusText('❌ Processing failed');
      setUploadProgress(0);
      setTimeout(() => setStatusText(null), 2000);
    } finally {
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
    if (!canRecord || isProcessing) return;

    setStatusText(null);
    chunksRef.current = [];

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
      const file = new File([blob], `recording-${Date.now()}.webm`, { type: blob.type });
      await processAudioFile(file);
    };

    mediaRecorder.start(250);
    setIsRecording(true);
  };

  const stopRecording = () => {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

    mediaRecorder.stop();
    setIsRecording(false);
  };

  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await processAudioFile(file);
  };

  const onCreateFolder = async () => {
    const name = window.prompt('Folder name?');
    if (!name) return;

    setIsProcessing(true);
    setStatusText('Creating folder...');

    try {
      const folder = await createScribeFolder(name);
      await refreshFolders();
      setSelectedFolderId(folder.id);
      setStatusText('Folder created!');
      setTimeout(() => setStatusText(null), 1200);
    } catch (error) {
      console.error('Failed to create folder:', error);
      setStatusText('Unable to create folder');
      setTimeout(() => setStatusText(null), 2000);
    } finally {
      setIsProcessing(false);
    }
  };

  const onDeleteFolder = async (folderId: string) => {
    const confirmed = window.confirm('Delete this folder and all notes inside it?');
    if (!confirmed) return;

    setIsProcessing(true);
    try {
      await deleteScribeFolder(folderId);
      await refreshFolders();
      await refreshNotes(selectedFolderId === folderId ? null : selectedFolderId);
    } catch (error) {
      console.error('Failed to delete folder:', error);
      setStatusText(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const onDeleteNote = async (noteId: string) => {
    const confirmed = window.confirm('Delete this note?');
    if (!confirmed) return;

    try {
      await deleteScribeNote(noteId);
      await refreshNotes(selectedFolderId);
    } catch (error) {
      console.error('Failed to delete note:', error);
      setStatusText(null);
    }
  };

  const onCreateNoteByChat = async () => {
    const prompt = chatPrompt.trim();
    if (!prompt) return;

    setIsProcessing(true);
    setStatusText('📝 Processing chat input...');

    try {
      setTimeout(() => {
        setStatusText('✨ Generating structured notes...');
      }, 500);

      const created = await createScribeGroqNoteFromChat(selectedFolderId, prompt);
      setChatPrompt('');
      setLastTranscript(created.transcript || '');
      setLastNotes(created.structured_notes);
      await refreshNotes(selectedFolderId);
      setStatusText('✅ Note created!');
      setTimeout(() => setStatusText(null), 1200);
    } catch (error) {
      console.error('Failed to create note:', error);
      setStatusText('❌ Failed to create note');
      setTimeout(() => setStatusText(null), 2000);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex h-full gap-4 p-4">
      <GlassCard className="flex w-72 flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Folders</h3>
            <p className="text-xs text-slate-500">Organize your notes</p>
          </div>
          <motion.button
            onClick={onCreateFolder}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="rounded-lg bg-slate-800 p-2 text-slate-300 hover:bg-slate-700"
            title="Create folder"
          >
            <FolderPlus size={16} />
          </motion.button>
        </div>

        <div className="flex-1 space-y-1 overflow-auto">
          {folders.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-700 p-4 text-center">
              <p className="text-xs text-slate-400">No folders yet</p>
              <p className="mt-2 text-xs text-slate-500">Create one to organize your notes</p>
            </div>
          )}
          {folders.map((folder) => {
            const folderNotes = notes.filter((note) => note.folder_id === folder.id);
            const isSelected = selectedFolderId === folder.id;
            return (
              <motion.button
                key={folder.id}
                onClick={() => setSelectedFolderId(folder.id)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`w-full rounded-lg px-3 py-3 text-left transition-all ${
                  isSelected
                    ? 'border border-amber-400/40 bg-linear-to-r from-amber-500/25 to-amber-600/10 shadow-lg shadow-amber-500/10'
                    : 'border border-slate-700/50 bg-slate-900/40 hover:bg-slate-800/60 hover:border-slate-600'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate font-medium ${isSelected ? 'text-amber-300' : 'text-slate-300'}`}>
                      {folder.name}
                    </span>
                    <motion.span
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onDeleteFolder(folder.id);
                      }}
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      className="rounded p-1 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"
                      title="Delete folder"
                    >
                      <Trash2 size={14} />
                    </motion.span>
                  </div>
                  <div className={`text-xs ${isSelected ? 'text-amber-200/70' : 'text-slate-500'}`}>
                    {folderNotes.length} {folderNotes.length === 1 ? 'note' : 'notes'}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </GlassCard>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <GlassCard className="p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-200">Scribe Studio</h2>
              <p className="text-sm text-slate-500">
                Groq Whisper Large-v3 to transcript to structured notes in your KAI theme
              </p>
            </div>
            <div className="flex gap-2">
              <motion.button
                onClick={onPickFile}
                disabled={isProcessing}
                className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Upload size={16} />
                Upload
              </motion.button>
              <motion.button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={!canRecord || isProcessing}
                className="flex items-center gap-2 rounded-lg bg-amber-500/20 px-4 py-2 text-sm text-amber-500 transition-colors hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isProcessing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : isRecording ? (
                  <Square size={16} />
                ) : (
                  <Mic size={16} />
                )}
                {isProcessing ? 'Processing...' : isRecording ? 'Stop' : 'Record'}
              </motion.button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*,.mp3,.wav,.m4a,.webm,.mp4"
            className="hidden"
            onChange={onFileChange}
          />

          <div className="flex items-center gap-4 rounded-2xl border border-dashed border-amber-500/20 bg-[linear-gradient(135deg,rgba(251,191,36,0.08),rgba(15,23,42,0.45))] p-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-linear-to-br from-amber-500/20 to-orange-500/20">
              <Wand2 size={24} className="text-amber-500" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-slate-200">AI-Powered Voice Notes</p>
                <span className="rounded-full border border-amber-500/15 bg-amber-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-amber-200">
                  Groq Whisper Large-v3
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Upload audio, lectures, or screen recordings. KAI turns them into a Scribe sheet with clean bullets and sectioned notes.
              </p>
              {statusText && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    {statusText === '✅ Complete!' ? (
                      <CheckCircle2 size={14} className="text-emerald-400" />
                    ) : statusText.startsWith('❌') ? (
                      <FileAudio size={14} className="text-rose-400" />
                    ) : (
                      <Loader2 size={14} className="animate-spin text-amber-400" />
                    )}
                    <span>{statusText}</span>
                  </div>
                  {uploadProgress > 0 && uploadProgress < 100 && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="h-full bg-linear-to-r from-amber-500 to-amber-400"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <PencilLine size={16} className="text-amber-400" />
                Create notes by chat
              </h4>
              <motion.button
                onClick={onCreateNoteByChat}
                disabled={isProcessing || !chatPrompt.trim()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-2 rounded-lg bg-amber-500/20 px-3 py-2 text-xs text-amber-400 hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={14} />
                Create
              </motion.button>
            </div>
            <textarea
              value={chatPrompt}
              onChange={(event) => setChatPrompt(event.target.value)}
              placeholder="Example: Create Scribe notes on Groq Whisper voice-to-notes flow with tight headings, bullet points, key takeaways, and action items."
              className="min-h-24 w-full rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-amber-500/40"
            />
          </div>

          {(lastTranscript || lastNotes) && (
            <div className="mt-4 rounded-2xl border border-amber-500/10 bg-slate-950/30 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">
                <Sparkles size={14} />
                Latest Scribe Sheet
              </div>
              <StructuredNotesPanel notes={lastNotes} transcript={lastTranscript} />
            </div>
          )}
        </GlassCard>

        <div className="min-w-0 flex-1 space-y-3 overflow-y-auto">
          <div className="space-y-2 px-1">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium text-slate-400">Notes History</h3>
                <p className="mt-0.5 text-xs text-slate-500">Folder: <span className="font-semibold text-amber-300">{folderName}</span></p>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                noteCount > 0
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-slate-800/50 text-slate-500'
              }`}>
                {noteCount}
              </span>
            </div>
          </div>

          {noteCount === 0 && (
            <GlassCard className="p-6 text-center">
              <div className="space-y-2">
                <FileAudio className="mx-auto text-slate-600" size={32} />
                <p className="text-sm text-slate-400">
                  No notes in <span className="font-medium text-amber-300">{folderName}</span>
                </p>
                <p className="text-xs text-slate-500">
                  {selectedFolderId ? 'Upload audio or create notes to get started' : 'Select a folder or create a new one'}
                </p>
              </div>
            </GlassCard>
          )}
          
          {notes.map((note, index) => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
            >
              <AudioCard note={noteToAudioNote(note)} onDelete={onDeleteNote} />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
