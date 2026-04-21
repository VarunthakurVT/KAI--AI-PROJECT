import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles, User, BookOpen, Target, Zap, Plus, X } from 'lucide-react';
import {
  listCourses,
  createCourse,
  register,
  getMe,
  getToken,
  waitForApiHealth,
  completeGoogleLogin,
  getGoogleLoginUrl,
  getAuthProviders,
} from '../shared/api/nexusApi';

interface OnboardingScreenProps {
  onComplete: (name: string, courseId?: string) => void;
}

interface CourseOption {
  id: string;
  title: string;
}

const greetings = [
  "Hello there!",
  "Welcome to KAI.",
  "I'm your AI learning companion.",
  "Before we begin, I'd love to know...",
];

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.9-5.4 3.9-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.6 3.6 14.6 2.8 12 2.8A9.2 9.2 0 0 0 2.7 12 9.2 9.2 0 0 0 12 21.2c5.3 0 8.8-3.7 8.8-8.9 0-.6-.1-1.1-.2-1.6z" />
      <path fill="#34A853" d="M3.8 7 7 9.3A5.9 5.9 0 0 1 12 6c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.6 3.6 14.6 2.8 12 2.8 8.4 2.8 5.3 4.8 3.8 7z" />
      <path fill="#FBBC05" d="M2.7 12c0 1.5.4 2.9 1.1 4.1L7 13.7A5.7 5.7 0 0 1 6.1 12c0-.6.1-1.2.3-1.7L3.8 7A9 9 0 0 0 2.7 12z" />
      <path fill="#4285F4" d="M12 21.2c2.5 0 4.6-.8 6.1-2.3l-3-2.4c-.8.5-1.8.8-3.1.8A5.9 5.9 0 0 1 7 14.7l-3.2 2.4A9.2 9.2 0 0 0 12 21.2z" />
    </svg>
  );
}

function getGoogleAuthErrorMessage(code: string | null): string {
  switch (code) {
    case 'google_access_denied':
      return 'Google sign-in was cancelled before KAI could finish setup.';
    case 'google_email_not_verified':
      return 'Your Google account email is not verified yet. Please verify it first, then try again.';
    case 'google_not_configured':
      return '';
    default:
      return 'Google sign-in started, but KAI could not finish the session. Please try again.';
  }
}

function clearAuthRedirectParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete('auth');
  url.searchParams.delete('auth_error');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [stage, setStage] = useState<'greeting' | 'question' | 'course' | 'features'>(() => {
    if (typeof window === 'undefined') return 'greeting';
    const search = new URLSearchParams(window.location.search);
    return search.has('auth') || search.has('auth_error') ? 'question' : 'greeting';
  });
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [name, setName] = useState('');
  const [showCursor, setShowCursor] = useState(true);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [authError, setAuthError] = useState('');
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [courseLoading, setCourseLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseDesc, setNewCourseDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isGoogleRedirecting, setIsGoogleRedirecting] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const authRequestRef = useRef<Promise<boolean> | null>(null);
  const handledOAuthCallbackRef = useRef(false);

  const buildOnboardingEmail = useCallback((displayName: string) => {
    const base = displayName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '') || 'learner';
    const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Date.now().toString(36);
    return `${base}.${suffix}@kai-user.app`;
  }, []);

  const ensureAuthenticatedSession = useCallback(async (displayName: string) => {
    if (getToken()) return true;
    if (authRequestRef.current) return authRequestRef.current.catch(() => false);

    const promise = (async () => {
      try {
        // Make sure the backend API is up before attempting onboarding registration.
        setApiStatus('checking');
        await waitForApiHealth({ timeoutMs: 12_000, intervalMs: 800 });
        setApiStatus('online');

        const safeName = displayName.trim() || 'KAI Learner';
        const email = buildOnboardingEmail(safeName);
        const passwordSeed = typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
          : `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
        const password = `KaiTemp!${passwordSeed}`;
        await register(email, password, safeName);
        return true;
      } catch (error) {
        console.error('Auto-registration error:', error);
        setApiStatus('offline');
        return false;
      } finally {
        authRequestRef.current = null;
      }
    })();

    authRequestRef.current = promise;
    return promise.catch(() => false);
  }, [buildOnboardingEmail]);

  // Cursor blink effect
  useEffect(() => {
    const interval = setInterval(() => setShowCursor(prev => !prev), 530);
    return () => clearInterval(interval);
  }, []);

  // Check API status early so the very first screen can show it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setApiStatus('checking');
        await waitForApiHealth({ timeoutMs: 6_000, intervalMs: 700 });
        if (!cancelled) setApiStatus('online');
      } catch {
        if (!cancelled) setApiStatus('offline');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Detect which OAuth providers are enabled in the Auth-BFF.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const providers = await getAuthProviders();
        if (!cancelled) setGoogleEnabled(Boolean(providers.google));
      } catch {
        if (!cancelled) setGoogleEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || handledOAuthCallbackRef.current) return;

    const search = new URLSearchParams(window.location.search);
    const authProvider = search.get('auth');
    const authErrorCode = search.get('auth_error');
    if (!authProvider && !authErrorCode) return;

    handledOAuthCallbackRef.current = true;
    let cancelled = false;

    const hydrateGoogleSession = async () => {
      if (authErrorCode) {
        if (!cancelled) {
          setStage('question');
          const message = getGoogleAuthErrorMessage(authErrorCode);
          setAuthError(message);
          setIsGoogleRedirecting(false);
        }
        clearAuthRedirectParams();
        return;
      }

      if (authProvider !== 'google') return;

      try {
        if (!cancelled) {
          setStage('question');
          setAuthError('');
          setIsGoogleRedirecting(true);
          setApiStatus('checking');
        }

        await completeGoogleLogin();
        const profile = await getMe();
        if (cancelled) return;

        const resolvedName = profile.display_name?.trim() || profile.email.split('@')[0] || 'KAI Learner';
        setName(resolvedName);
        setApiStatus('online');
        setStage('course');
      } catch (error) {
        console.error('Failed to finalize Google auth:', error);
        if (!cancelled) {
          setApiStatus('offline');
          setStage('question');
          setAuthError(getGoogleAuthErrorMessage('google_callback_failed'));
        }
      } finally {
        if (!cancelled) {
          setIsGoogleRedirecting(false);
        }
        clearAuthRedirectParams();
      }
    };

    void hydrateGoogleSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load courses once onboarding reaches the course stage and a session exists.
  useEffect(() => {
    if (stage !== 'course') return;

    let cancelled = false;
    const loadCourses = async () => {
      try {
        setCourseLoading(true);
        const isAuthenticated = await ensureAuthenticatedSession(name);
        if (!isAuthenticated) {
          if (!cancelled) setCourses([]);
          return;
        }

        const courseList = await listCourses();
        if (!cancelled) {
          setCourses(courseList || []);
        }
      } catch (error) {
        console.error('Failed to load courses:', error);
        if (!cancelled) {
          setCourses([]);
        }
      } finally {
        if (!cancelled) {
          setCourseLoading(false);
        }
      }
    };

    loadCourses();
    return () => {
      cancelled = true;
    };
  }, [ensureAuthenticatedSession, name, stage]);

  // Typewriter effect for greetings
  useEffect(() => {
    if (stage !== 'greeting') return;
    if (greetingIndex >= greetings.length) {
      setTimeout(() => setStage('question'), 500);
      return;
    }

    const message = greetings[greetingIndex];
    let charIndex = 0;
    setDisplayedText('');

    const typeInterval = setInterval(() => {
      if (charIndex <= message.length) {
        setDisplayedText(message.slice(0, charIndex));
        charIndex++;
      } else {
        clearInterval(typeInterval);
        setTimeout(() => {
          setGreetingIndex(prev => prev + 1);
        }, 800);
      }
    }, 40);

    return () => clearInterval(typeInterval);
  }, [greetingIndex, stage]);

  // Focus input when question stage appears
  useEffect(() => {
    if (stage === 'question') {
      setTimeout(() => inputRef.current?.focus(), 500);
    }
  }, [stage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      setAuthError('');
      setStage('course');
    }
  };

  const handleGoogleContinue = () => {
    if (!googleEnabled) return;
    setAuthError('');
    setIsGoogleRedirecting(true);
    window.location.assign(getGoogleLoginUrl());
  };

  const handleSelectCourse = (courseId: string) => {
    setSelectedCourse(courseId);
    setStage('features');
  };

  const handleSkipCourse = () => {
    setSelectedCourse(null);
    setStage('features');
  };

  const handleCreateCourse = async () => {
    if (!newCourseName.trim()) return;
    setIsCreating(true);
    try {
      const isAuthenticated = await ensureAuthenticatedSession(name);
      if (!isAuthenticated) {
        throw new Error('Unable to create an onboarding session. Please try again.');
      }

      const response = await createCourse(newCourseName, newCourseDesc || undefined);
      const newCourse = { id: response.id, title: response.title };
      setCourses((currentCourses) => [...currentCourses, newCourse]);
      setSelectedCourse(newCourse.id);
      setNewCourseName('');
      setNewCourseDesc('');
      setShowCreateModal(false);
      setStage('features');
    } catch (error) {
      console.error('Failed to create course:', error);
      alert('Failed to create course. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleContinue = () => {
    onComplete(name.trim(), selectedCourse || undefined);
  };

  const features = [
    { icon: Sparkles, title: 'AI Commander', desc: 'Chat with your personal learning AI' },
    { icon: BookOpen, title: 'Scribe', desc: 'Transform audio into structured notes' },
    { icon: Target, title: 'Knowledge Vault', desc: '3D visualization of your mastery' },
    { icon: Zap, title: 'Examiner', desc: 'AI-generated practice exams' },
  ];

  return (
    <div className="fixed inset-0 bg-slate-950 flex items-center justify-center overflow-hidden">
      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
      </div>

      <div className="absolute top-4 right-4 z-20">
        <div
          className={[
            'px-3 py-1.5 rounded-full text-xs font-semibold border backdrop-blur',
            apiStatus === 'online' && 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
            apiStatus === 'offline' && 'bg-rose-500/10 border-rose-500/30 text-rose-300',
            apiStatus === 'checking' && 'bg-slate-500/10 border-slate-500/30 text-slate-300',
          ].filter(Boolean).join(' ')}
        >
          API: {apiStatus === 'checking' ? 'checking…' : apiStatus}
        </div>
      </div>

      <div className="relative z-10 w-full max-w-2xl px-8">
        <AnimatePresence mode="wait">
          {/* Greeting Stage */}
          {stage === 'greeting' && (
            <motion.div
              key="greeting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center"
            >
              {/* AI Avatar */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', duration: 0.8 }}
                className="w-24 h-24 mx-auto mb-8 rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-2xl shadow-amber-500/20"
              >
                <span className="text-white font-bold text-4xl">K</span>
              </motion.div>

              {/* Greeting messages */}
              <div className="h-20 flex flex-col items-center justify-center">
                {greetings.slice(0, greetingIndex).map((msg, i) => (
                  <motion.p
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 0.5, y: 0 }}
                    className="text-slate-500 text-lg mb-1"
                  >
                    {msg}
                  </motion.p>
                ))}
                {greetingIndex < greetings.length && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-slate-200 text-2xl font-medium"
                  >
                    {displayedText}
                    <span className={`inline-block w-0.5 h-6 bg-amber-500 ml-1 ${showCursor ? 'opacity-100' : 'opacity-0'}`} />
                  </motion.p>
                )}
              </div>
            </motion.div>
          )}

          {/* Question Stage */}
          {stage === 'question' && (
            <motion.div
              key="question"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center"
            >
              {/* AI Avatar */}
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-xl shadow-amber-500/20"
              >
                <span className="text-white font-bold text-3xl">K</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-3xl font-bold text-slate-200 mb-2"
              >
                What's your name?
              </motion.h1>
              
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-slate-500 mb-8"
              >
                I'd like to personalize your learning experience
              </motion.p>

              {authError && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="max-w-md mx-auto mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-left text-sm text-rose-200"
                >
                  {authError}
                </motion.div>
              )}

              <motion.form
                onSubmit={handleSubmit}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="max-w-md mx-auto"
              >
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <User size={20} className="text-slate-500" />
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name..."
                    className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-900/80 border border-slate-800 text-slate-200 text-lg placeholder-slate-600 outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 transition-all"
                    autoComplete="off"
                  />
                </div>

                <motion.button
                  type="submit"
                  disabled={!name.trim() || isGoogleRedirecting}
                  className="mt-4 w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold text-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:from-amber-400 hover:to-orange-500 transition-all shadow-lg shadow-amber-500/20"
                  whileHover={name.trim() ? { scale: 1.02 } : undefined}
                  whileTap={name.trim() ? { scale: 0.98 } : undefined}
                >
                  Continue
                  <ArrowRight size={20} />
                </motion.button>

                {googleEnabled && (
                  <>
                    <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-600">
                      <div className="h-px flex-1 bg-slate-800" />
                      <span>or</span>
                      <div className="h-px flex-1 bg-slate-800" />
                    </div>

                    <motion.button
                      type="button"
                      onClick={handleGoogleContinue}
                      disabled={isGoogleRedirecting}
                      className="w-full py-4 rounded-2xl bg-white text-slate-900 font-semibold text-lg flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-wait hover:bg-slate-100 transition-all shadow-lg shadow-black/20"
                      whileHover={!isGoogleRedirecting ? { scale: 1.02 } : undefined}
                      whileTap={!isGoogleRedirecting ? { scale: 0.98 } : undefined}
                    >
                      <GoogleMark />
                      {isGoogleRedirecting ? 'Connecting to Google...' : 'Continue with Google'}
                    </motion.button>

                    <p className="mt-3 text-sm text-slate-500">
                      We'll pull your name from Google and drop you straight into KAI.
                    </p>
                  </>
                )}
              </motion.form>
            </motion.div>
          )}

          {/* Course Selection Stage */}
          {stage === 'course' && (
            <motion.div
              key="course"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center"
            >
              {/* AI Avatar */}
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center shadow-xl shadow-emerald-500/20"
              >
                <span className="text-white font-bold text-3xl">📚</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-3xl font-bold text-slate-200 mb-2"
              >
                What course are you studying?
              </motion.h1>
              
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-slate-500 mb-8"
              >
                I'll use this to retrieve relevant materials from your course
              </motion.p>

              {courseLoading ? (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-slate-400">
                  Loading courses...
                </motion.p>
              ) : courses.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="max-w-md mx-auto space-y-3 mb-6"
                >
                  {courses.map((course) => (
                    <motion.button
                      key={course.id}
                      onClick={() => handleSelectCourse(course.id)}
                      className="w-full p-4 rounded-2xl bg-slate-900/50 border border-slate-800 text-slate-200 font-semibold hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all text-left flex items-center justify-between"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span>{course.title}</span>
                      <ArrowRight size={18} className="text-emerald-500" />
                    </motion.button>
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="max-w-md mx-auto p-4 rounded-2xl bg-slate-900/50 border border-slate-800 text-slate-400 mb-6"
                >
                  <p>No courses created yet. Create one now or continue later!</p>
                </motion.div>
              )}

              <div className="flex gap-4 justify-center max-w-md mx-auto">
                <motion.button
                  onClick={() => setShowCreateModal(true)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="flex-1 px-6 py-4 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-400 font-semibold flex items-center justify-center gap-2 transition-all"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Plus size={18} />
                  Create
                </motion.button>

                <motion.button
                  onClick={handleSkipCourse}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                  className="flex-1 px-6 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center justify-center gap-2 transition-all"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Skip
                  <ArrowRight size={18} />
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* Features Stage */}
          {stage === 'features' && (
            <motion.div
              key="features"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', duration: 0.6 }}
                className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center"
              >
                <Sparkles size={28} className="text-white" />
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-3xl font-bold text-slate-200 mb-2"
              >
                Nice to meet you, <span className="text-amber-500">{name}</span>!
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-slate-500 mb-8"
              >
                Here's what KAI can do for you
              </motion.p>

              <div className="grid grid-cols-2 gap-4 mb-8">
                {features.map((feature, i) => (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                    className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800 text-left hover:border-slate-700 transition-colors"
                  >
                    <feature.icon size={24} className="text-amber-500 mb-3" />
                    <h3 className="text-slate-200 font-semibold mb-1">{feature.title}</h3>
                    <p className="text-slate-500 text-sm">{feature.desc}</p>
                  </motion.div>
                ))}
              </div>

              <motion.button
                onClick={handleContinue}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold text-lg flex items-center justify-center gap-2 mx-auto hover:from-amber-400 hover:to-orange-500 transition-all shadow-lg shadow-amber-500/20"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Let's Get Started
                <ArrowRight size={20} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Course Creation Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
            onClick={() => !isCreating && setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-slate-200 flex items-center gap-2">
                  <BookOpen className="text-emerald-500" size={24} />
                  Create New Course
                </h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  disabled={isCreating}
                  className="text-slate-500 hover:text-slate-300 disabled:opacity-50 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    Course Name *
                  </label>
                  <input
                    type="text"
                    value={newCourseName}
                    onChange={(e) => setNewCourseName(e.target.value)}
                    placeholder="e.g., Advanced Calculus"
                    disabled={isCreating}
                    className="w-full px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700 text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    Description (optional)
                  </label>
                  <textarea
                    value={newCourseDesc}
                    onChange={(e) => setNewCourseDesc(e.target.value)}
                    placeholder="What is this course about?"
                    disabled={isCreating}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700 text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all resize-none disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <motion.button
                  onClick={() => setShowCreateModal(false)}
                  disabled={isCreating}
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-all disabled:opacity-50"
                  whileHover={!isCreating ? { scale: 1.02 } : undefined}
                  whileTap={!isCreating ? { scale: 0.98 } : undefined}
                >
                  Cancel
                </motion.button>
                <motion.button
                  onClick={handleCreateCourse}
                  disabled={isCreating || !newCourseName.trim()}
                  className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 text-white font-semibold hover:from-emerald-400 hover:to-cyan-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  whileHover={!isCreating && newCourseName.trim() ? { scale: 1.02 } : undefined}
                  whileTap={!isCreating && newCourseName.trim() ? { scale: 0.98 } : undefined}
                >
                  {isCreating ? 'Creating...' : 'Create Course'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
