import { useState, useRef, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { saveChatSession } from '../services/api';
import { motion, useDragControls } from 'framer-motion';
import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

const LOADING_PHASES = [
  "Anveshana (अन्वेषण) — Searching Grantha knowledge base...",
  "Manana (मनन) — Reflecting on the context...",
  "Chintana (चिन्तन) — Formulating a response..."
];

export default function RAGChatWidget() {
  const location = useLocation();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedSources, setExpandedSources] = useState(new Set());
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [showProbe, setShowProbe] = useState(false);
  const [isMinimised, setIsMinimised] = useState(false);

  const bottomRef = useRef(null);
  const dialogTextareaRef = useRef(null);
  const launcherRef = useRef(null);
  // Single full-viewport ref used as dragConstraints for both elements
  const viewportRef = useRef(null);

  const dragControls = useDragControls();

  // Auto-resize dialog textarea whenever input changes
  useEffect(() => {
    const el = dialogTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  }, [input]);

  // Focus dialog textarea when dialog opens
  useEffect(() => {
    if (dialogOpen) {
      setTimeout(() => dialogTextareaRef.current?.focus(), 50);
    }
  }, [dialogOpen]);

  useEffect(() => {
    const dismissed = localStorage.getItem('rag-probe-dismissed');
    if (!dismissed) {
      const timer = setTimeout(() => setShowProbe(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismissProbe = () => {
    setShowProbe(false);
    localStorage.setItem('rag-probe-dismissed', 'true');
  };

  const toggleSource = (sourceId) => {
    setExpandedSources(prev => {
      const next = new Set(prev);
      next.has(sourceId) ? next.delete(sourceId) : next.add(sourceId);
      return next;
    });
  };

  useEffect(() => {
    const handleResume = (e) => {
      const { sessionId, messages: history } = e.detail;
      setActiveSessionId(sessionId);
      setMessages((history || []).map(m => ({
        id: m._id || Date.now() + Math.random(),
        role: m.role,
        text: m.text,
        streaming: false,
        sources: [],
        faqsFound: 0
      })));
      setDialogOpen(true);
    };
    window.addEventListener('resume-rag-chat', handleResume);
    return () => window.removeEventListener('resume-rag-chat', handleResume);
  }, []);

  useEffect(() => {
    let interval;
    if (loading) {
      interval = setInterval(() => {
        setPhaseIndex(prev => (prev + 1) % LOADING_PHASES.length);
      }, 1500);
    } else {
      setPhaseIndex(0);
    }
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    if (dialogOpen && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, dialogOpen]);

  const sendMessage = async (e) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;
    if (showProbe) dismissProbe();

    const userText = input.trim();
    setInput('');
    setError('');
    setDialogOpen(true);

    const priorMessages = messages.map(m => ({ role: m.role, text: m.text }));
    const assistantMsgId = Date.now();

    setMessages(prev => [
      ...prev,
      { id: assistantMsgId, role: 'user', text: userText },
      { id: assistantMsgId + 1, role: 'assistant', text: '', streaming: true, sources: [], faqsFound: 0 }
    ]);

    setLoading(true);

    try {
      const res = await fetch('/api/rag/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': localStorage.getItem('token') || ''
        },
        body: JSON.stringify({ question: userText })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Something went wrong');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let metaParsed = false;
      let answerText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            if (!metaParsed) {
              const meta = JSON.parse(line.trim());
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId + 1
                  ? { ...m, sources: meta.sources || [], faqsFound: meta.faqsFound || 0 }
                  : m
              ));
              metaParsed = true;
            } else {
              const chunk = JSON.parse(line.trim());
              if (chunk.token) {
                answerText += chunk.token;
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId + 1 ? { ...m, text: m.text + chunk.token } : m
                ));
              }
              if (chunk.done) {
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId + 1 ? { ...m, streaming: false } : m
                ));
              }
              if (chunk.error) throw new Error(chunk.error);
            }
          } catch (e) {
            console.error('Error parsing stream chunk:', e);
          }
        }
      }

      if (buffer.trim()) {
        try {
          if (!metaParsed) {
            const meta = JSON.parse(buffer.trim());
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId + 1
                ? { ...m, sources: meta.sources || [], faqsFound: meta.faqsFound || 0 }
                : m
            ));
          } else {
            const chunk = JSON.parse(buffer.trim());
            if (chunk.token) {
              answerText += chunk.token;
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId + 1 ? { ...m, text: m.text + chunk.token } : m
              ));
            }
            if (chunk.done) {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId + 1 ? { ...m, streaming: false } : m
              ));
            }
            if (chunk.error) throw new Error(chunk.error);
          }
        } catch (e) {
          console.error('Error parsing trailing stream chunk:', e);
        }
      }

      const token = localStorage.getItem('token');
      if (token && answerText.trim()) {
        const finalMessages = [
          ...priorMessages,
          { role: 'user', text: userText },
          { role: 'assistant', text: answerText }
        ];
        try {
          const syncRes = await saveChatSession({ sessionId: activeSessionId, messages: finalMessages });
          if (syncRes.data?.session?._id) setActiveSessionId(syncRes.data.session._id);
        } catch (syncErr) {
          console.warn('Failed to sync chat session:', syncErr.message);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to get answer. Please try again.');
      setMessages(prev => prev.filter(m => m.id !== assistantMsgId + 1));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
  };

  const openDialog = () => {
    setDialogOpen(true);
    setIsMinimised(false);
    if (showProbe) dismissProbe();
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setIsMinimised(false);
    setError('');
  };

  const clearChat = () => {
    setMessages([]);
    setActiveSessionId(null);
    setError('');
  };

  if (
    ['/login', '/register', '/reset-password', '/verify-email', '/ask', '/profile'].includes(location.pathname) ||
    location.pathname.startsWith('/admin') ||
    location.pathname.startsWith('/leaderboard')
  ) {
    return null;
  }

  return (
    <>
      {/* Full-viewport invisible div used as dragConstraints anchor for both elements */}
      <div ref={viewportRef} className="fixed inset-0 z-0 pointer-events-none" />

      {/* ── Dialog ── */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/20 pointer-events-auto"
            onClick={closeDialog}
          />

          {/* Draggable dialog panel */}
          <motion.div
            drag
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            dragElastic={0}
            dragConstraints={viewportRef}
            className="absolute bottom-24 left-0 right-0 mx-auto w-[min(calc(100vw-2rem),32rem)] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden pointer-events-auto"
            style={{ maxHeight: isMinimised ? '48px' : 'min(65vh, 560px)' }}
            animate={{ maxHeight: isMinimised ? 48 : 560 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            {/* Drag handle bar */}
            <div
              onPointerDown={(e) => {
                e.preventDefault();
                dragControls.start(e, { snapToCursor: false });
              }}
              className="flex items-center justify-between px-5 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 shrink-0 cursor-grab active:cursor-grabbing select-none"
            >
              {/* Title — also acts as restore trigger when minimised */}
              <button
                type="button"
                onClick={() => isMinimised && setIsMinimised(false)}
                className={`flex items-center gap-2 ${isMinimised ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-xs uppercase tracking-wider">FAQ Assistant</h2>
                {messages.filter(m => m.role === 'assistant').length > 0 && (
                  <span className="text-[11px] text-slate-400">
                    ({messages.filter(m => m.role === 'assistant').length})
                  </span>
                )}
                {isMinimised && loading && (
                  <span className="flex gap-0.5 ml-1">
                    <span className="w-1 h-1 bg-primary-500 rounded-full animate-pulse-dot" />
                    <span className="w-1 h-1 bg-primary-500 rounded-full animate-pulse-dot" style={{ animationDelay: '200ms' }} />
                    <span className="w-1 h-1 bg-primary-500 rounded-full animate-pulse-dot" style={{ animationDelay: '400ms' }} />
                  </span>
                )}
              </button>
              <div className="flex items-center gap-2">
                {!isMinimised && (
                  <button
                    onClick={clearChat}
                    className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Clear
                  </button>
                )}
                {/* Minimize / restore button */}
                <button
                  onClick={() => setIsMinimised(v => !v)}
                  title={isMinimised ? 'Restore chat' : 'Minimise chat'}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {isMinimised ? (
                    /* Restore — chevron up */
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  ) : (
                    /* Minimise — minus/dash */
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={closeDialog}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className={`flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-[150px] ${isMinimised ? 'hidden' : ''}`}>
              {messages.length === 0 && !loading && (
                <div className="text-center py-8 text-slate-400 text-sm">
                  <p className="mb-1">👋 Ask me anything about the FAQ knowledge base.</p>
                  <p className="text-xs">I'll search existing FAQs to find you an answer.</p>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary-600 text-white rounded-tr-sm'
                      : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100 rounded-tl-sm'
                  }`}>
                    {msg.streaming && !msg.text ? (
                      <div className="flex flex-col gap-1 py-0.5 pr-2 select-none">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2 w-2 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
                          </span>
                          <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 animate-pulse">
                            {LOADING_PHASES[phaseIndex]}
                          </span>
                        </div>
                      </div>
                    ) : msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    ) : (
                      <div
                        className="prose dark:prose-invert max-w-none text-slate-800 dark:text-slate-100 prose-sm prose-p:leading-relaxed prose-pre:my-1 prose-pre:p-2 prose-pre:bg-slate-200 dark:prose-pre:bg-slate-900/60"
                        dangerouslySetInnerHTML={{ __html: marked.parse(msg.text + (msg.streaming ? ' ▌' : '')) }}
                      />
                    )}

                    {msg.role === 'assistant' && !msg.streaming && msg.sources?.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                        <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Sources:</p>
                        <div className="space-y-1.5">
                          {msg.sources.slice(0, 3).map(s => {
                            const isExpanded = expandedSources.has(s._id);
                            return (
                              <div key={s._id} className="rounded-xl border border-slate-200/40 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => toggleSource(s._id)}
                                  className="w-full flex items-center justify-between text-left px-3 py-2 text-[11px] font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 transition-all gap-2"
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-primary-500 shrink-0">•</span>
                                    <span className="truncate">{s.title}</span>
                                  </div>
                                  <span className="shrink-0 text-slate-400 dark:text-slate-500" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                    </svg>
                                  </span>
                                </button>
                                {isExpanded && (
                                  <div className="px-3 pb-3 pt-1 border-t border-slate-200/35 dark:border-slate-800/50 bg-white dark:bg-slate-950/40">
                                    <p className="text-[12px] leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap font-sans">
                                      {s.content || "No preview available. View details in Wiki."}
                                    </p>
                                    <div className="mt-2 flex justify-end">
                                      <Link
                                        to={`/wiki?highlight=${s._id}`}
                                        onClick={closeDialog}
                                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                                      >
                                        Open in Wiki
                                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                      </Link>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {error && (
                <div className="flex justify-start">
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl rounded-tl-sm px-4 py-2 text-sm">
                    ⚠ {error}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Dialog input — auto-expanding textarea */}
            <div className={`shrink-0 px-5 py-4 bg-white dark:bg-slate-900 border-t dark:border-slate-800 ${isMinimised ? 'hidden' : ''}`}>
              <form onSubmit={sendMessage} className="relative">
                <textarea
                  ref={dialogTextareaRef}
                  className="w-full pl-4 pr-12 py-3 text-sm border border-slate-200 dark:border-slate-800 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 placeholder-slate-400 dark:placeholder-slate-500 bg-slate-50 dark:bg-slate-800/40 dark:text-slate-100 overflow-y-auto"
                  placeholder="Ask about the FAQs..."
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  rows={1}
                  style={{ minHeight: '46px', maxHeight: '150px' }}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="absolute right-3.5 bottom-3 p-1.5 rounded-xl text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-30 disabled:hover:text-slate-400 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </form>
            </div>
          </motion.div>
        </div>
      )}

      {/* Viewport bottom gradient mask */}
      <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-50 via-slate-50/80 to-transparent dark:from-[#0d1117] dark:via-[#0d1117]/80 pointer-events-none z-30" />

      {/* ── Tooltip Probe ── */}
      {showProbe && (
        <div className="fixed bottom-[85px] left-1/2 -translate-x-1/2 z-40 w-full max-w-md px-4 animate-fade-in">
          <div className="relative bg-gradient-to-r from-amber-500/95 to-amber-600/95 dark:from-amber-600 dark:to-amber-700 text-white p-3.5 rounded-xl shadow-xl backdrop-blur-md border border-amber-400/20 dark:border-amber-500/10 flex items-start gap-3">
            <div className="absolute bottom-[-5px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-amber-600 dark:bg-amber-700 rotate-45" />
            <span className="text-base shrink-0 mt-0.5 select-none">⚡</span>
            <div className="flex-1 pr-5">
              <h4 className="font-semibold text-[11px] uppercase tracking-wider text-amber-100/90 font-serif">AI Instant Search</h4>
              <p className="text-xs text-white/95 mt-0.5 leading-relaxed font-medium">
                Skip the manual exploration and get your queries instantaneously!
              </p>
            </div>
            <button
              onClick={dismissProbe}
              className="absolute top-2 right-2 text-white/60 hover:text-white p-0.5 rounded-lg hover:bg-white/10"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Launcher Bar — hidden when dialog is open ── */}
      {!dialogOpen && (
        <motion.div
          ref={launcherRef}
          drag
          dragMomentum={false}
          dragElastic={0}
          dragConstraints={viewportRef}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-xl px-4 cursor-grab active:cursor-grabbing"
        >
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          {/* Drag handle icon */}
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 text-slate-300 dark:text-slate-600 select-none pointer-events-none">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </div>

          <input
            type="text"
            className="w-full pl-10 pr-12 py-3 text-sm border border-slate-200 dark:border-slate-800 rounded-2xl
                       focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500
                       placeholder-slate-400 dark:placeholder-slate-500 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md
                       shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)]
                       hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all dark:text-slate-100 cursor-text"
            placeholder="Ask the FAQ assistant..."
            value={input}
            onChange={e => {
              setInput(e.target.value);
              if (e.target.value.trim()) setDialogOpen(true);
              if (showProbe) dismissProbe();
            }}
            onFocus={() => {
              openDialog();
            }}
            onClick={() => {
              openDialog();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />

          {loading ? (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-0.5 pointer-events-none">
              <span className="w-1 h-1 bg-primary-500 rounded-full animate-pulse-dot" />
              <span className="w-1 h-1 bg-primary-500 rounded-full animate-pulse-dot" style={{ animationDelay: '200ms' }} />
              <span className="w-1 h-1 bg-primary-500 rounded-full animate-pulse-dot" style={{ animationDelay: '400ms' }} />
            </div>
          ) : (
            <button
              type="button"
              disabled={!input.trim() || loading}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); sendMessage(e); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-xl text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-30 disabled:hover:text-slate-400 transition-all pointer-events-auto"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          )}
        </div>

        {/* Samagama link — static, sits directly below the RAG chat input */}
        <p className="text-center mt-2 mb-2 text-xs text-slate-400 dark:text-slate-500">
          Need more details? Visit{' '}
          <a
            href="https://www.samagama.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors underline-offset-2 hover:underline"
          >
            samagama.in
          </a>
        </p>
      </motion.div>
      )}
    </>
  );
}
