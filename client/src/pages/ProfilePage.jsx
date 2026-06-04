import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastProvider';
import { getBookmarks, toggleBookmark, getLikedFAQs, getChatSessions, getChatSessionDetails, logoutAllDevices } from '../services/api';
import { Link, useNavigate } from 'react-router-dom';
import { getVolunteerLevel, getUserBadges } from '../utils/gamificationHelper';
import { getInitials, getAvatarColor } from '../utils/avatar';

export default function ProfilePage() {
  const { user, setBookmarks, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  
  const [savedFaqs, setSavedFaqs] = useState([]);
  const [likedFaqs, setLikedFaqs] = useState([]);
  const [chatSessions, setChatSessions] = useState([]);
  const [activeTab, setActiveTab] = useState('bookmarks'); // 'bookmarks', 'likes', 'chats'
  const [loading, setLoading] = useState(true);
  const [expandedFaqId, setExpandedFaqId] = useState(null);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  const handleLogoutAll = async () => {
    try {
      setLoggingOutAll(true);
      await logoutAllDevices();
      toast.success('Successfully signed out of all devices');
      logout();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to sign out of all devices');
    } finally {
      setLoggingOutAll(false);
    }
  };

  useEffect(() => {
    if (user && user.role === 'admin') {
      navigate('/admin', { replace: true });
      return;
    }
    loadProfileData();
  }, [user, navigate]);

  const loadProfileData = async () => {
    try {
      setLoading(true);
      const [resBookmarks, resLikes, resChats] = await Promise.all([
        getBookmarks().catch(() => ({ data: [] })),
        getLikedFAQs().catch(() => ({ data: [] })),
        getChatSessions().catch(() => ({ data: [] }))
      ]);
      setSavedFaqs(resBookmarks.data || []);
      setLikedFaqs(resLikes.data || []);
      setChatSessions(resChats.data || []);
    } catch (err) {
      toast.error('Failed to load profile details');
    } finally {
      setLoading(false);
    }
  };

  const handleUnbookmark = async (e, faqId) => {
    e.stopPropagation();
    try {
      const res = await toggleBookmark(faqId);
      setBookmarks(res.data.bookmarks);
      setSavedFaqs(prev => prev.filter(f => f._id !== faqId));
      toast.success('Removed FAQ from saved list');
    } catch (err) {
      toast.error('Failed to remove FAQ');
    }
  };

  const handleResumeChat = async (sessionId) => {
    try {
      toast.info('Retrieving conversation logs...');
      const res = await getChatSessionDetails(sessionId);
      if (res.data && res.data.messages) {
        // Dispatch the custom event to open the RAG chat widget and load this session
        const event = new CustomEvent('resume-rag-chat', {
          detail: { sessionId, messages: res.data.messages }
        });
        window.dispatchEvent(event);
      } else {
        throw new Error('No messages found in session log');
      }
    } catch (err) {
      toast.error('Failed to resume chat session: ' + err.message);
    }
  };

  if (!user) return null;

  const joinDate = new Date(user.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* Page Title Header */}
      <div className="border-b border-slate-200/60 dark:border-slate-800/60 pb-6 mb-8 select-none">
        <h1 className="text-3xl font-light tracking-tight text-slate-900 dark:text-slate-100 font-serif">
          My Profile
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 font-light">
          Manage your saved content, monitor your community reputation, and review your previous RAG assistant sessions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: User Profile Details */}
        <div className="lg:col-span-4 space-y-6">
          <div className="card bg-white/70 dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800/50 rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.01)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.25)] backdrop-blur-md">
            {/* Avatar & Basic Info */}
            <div className="flex flex-col items-center text-center pb-6 border-b border-slate-150 dark:border-slate-800/50">
             <div
                className={`w-20 h-20 ${getAvatarColor(user.name)} text-white rounded-full text-3xl font-serif flex items-center justify-center shadow-inner mb-4 select-none`}
              >
                {getInitials(user.name)} 
              </div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 font-serif">{user.name}</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{user.email}</p>
              
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold mt-3 px-2.5 py-0.5 rounded-full select-none ${
                user.role === 'admin' 
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/30' 
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/30'
              }`}>
                {user.role === 'admin' ? '🛡️ Administrator' : '🎓 Community Member'}
              </span>
            </div>

            {/* Profile Statistics Grid */}
            <div className={`grid ${user.role === 'admin' ? 'grid-cols-2' : 'grid-cols-3'} gap-3 py-6 border-b border-slate-150 dark:border-slate-800/50 select-none`}>
              <div className="text-center p-3 rounded-2xl bg-slate-50/50 dark:bg-slate-950/15 border border-slate-100/50 dark:border-slate-850/50">
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">Reputation</p>
                <p className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-1 font-serif">🏆 {user.reputation || 0}</p>
              </div>
              <div className="text-center p-3 rounded-2xl bg-slate-50/50 dark:bg-slate-950/15 border border-slate-100/50 dark:border-slate-850/50">
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">Saved Bookmarks</p>
                <p className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-1 font-serif">🔖 {savedFaqs.length}</p>
              </div>
              {user.role !== 'admin' && (
                <div className="text-center p-3 rounded-2xl bg-slate-50/50 dark:bg-slate-950/15 border border-slate-100/50 dark:border-slate-850/50">
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">Global Rank</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-1 font-serif">⚡ #{user.rank || 'N/A'}</p>
                </div>
              )}
            </div>

            {/* Micro Details List */}
            <div className="pt-6 space-y-3.5 text-xs select-none">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span>Questions Raised:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">{user.questionsAsked || 0}</span>
              </div>
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span>Peer Answers Given:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">{user.answersGiven || 0}</span>
              </div>
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span>Member Since:</span>
                <span className="font-medium text-slate-700 dark:text-slate-200">{joinDate}</span>
              </div>
            </div>

            {/* Sign out of all active devices */}
            <div className="pt-6 mt-6 border-t border-slate-150 dark:border-slate-800/50">
              <button
                onClick={handleLogoutAll}
                disabled={loggingOutAll}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold border border-red-200/50 dark:border-red-900/30 text-red-650 dark:text-red-400 bg-red-50/30 dark:bg-red-950/10 hover:bg-red-50 dark:hover:bg-red-950/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none select-none"
              >
                {loggingOutAll ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
                    Signing out...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign out of all devices
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Volunteer Level & Badges Card */}
          {user.isVolunteer && getVolunteerLevel(user) && (
            <div className="card bg-white/70 dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800/50 rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.01)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.25)] backdrop-blur-md space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-serif font-bold text-base text-slate-850 dark:text-slate-100 flex items-center gap-2">
                  🎖️ Responder Rank
                </h3>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${getVolunteerLevel(user).badgeClass}`}>
                  {getVolunteerLevel(user).icon} {getVolunteerLevel(user).name}
                </span>
              </div>

              {/* Level progression bar if there is a next level */}
              {getVolunteerLevel(user).nextThreshold && (
                <div className="space-y-2 select-none">
                  <div className="flex items-center justify-between text-[11px] text-slate-450 dark:text-slate-500 font-semibold">
                    <span>Progress to {getVolunteerLevel(user).nextThreshold.label}</span>
                    <span>{user.acceptedAnswersCount} / {getVolunteerLevel(user).nextThreshold.accepted} accepts</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-850 rounded-full h-2 overflow-hidden border border-slate-200/30 dark:border-slate-800/40">
                    <div 
                      className="bg-primary-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (user.acceptedAnswersCount / getVolunteerLevel(user).nextThreshold.accepted) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal font-light">
                    Unlock next level at {getVolunteerLevel(user).nextThreshold.reputation} reputation points and {getVolunteerLevel(user).nextThreshold.accepted} accepted answers.
                  </p>
                </div>
              )}

              {/* Achievements Badges list */}
              <div className="pt-4 border-t border-slate-150 dark:border-slate-800/80">
                <h4 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Earned Achievements Badges</h4>
                {getUserBadges(user).length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">No badges unlocked yet. Keep answering queries to earn achievements!</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5">
                    {getUserBadges(user).map(badge => (
                      <div key={badge.id} className={`flex items-start gap-2.5 p-3 rounded-2xl border ${badge.colorClass} select-none`}>
                        <span className="text-xl shrink-0 mt-0.5">{badge.icon}</span>
                        <div>
                          <h5 className="text-[11px] font-bold leading-none mb-1 uppercase tracking-wide">{badge.name}</h5>
                          <p className="text-[10px] leading-normal opacity-85 font-light">{badge.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Tabbed Dashboard Section */}
        <div className="lg:col-span-8">
          <div className="card bg-white/70 dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800/50 rounded-3xl p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.01)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.25)] backdrop-blur-md">
            
            {/* Tabs Navigation */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 pb-px mb-6 select-none gap-2">
              <button
                onClick={() => { setActiveTab('bookmarks'); setExpandedFaqId(null); }}
                className={`pb-3 px-1 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all ${
                  activeTab === 'bookmarks'
                    ? 'border-primary-500 text-primary-600 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                🔖 Bookmarks ({savedFaqs.length})
              </button>
              <button
                onClick={() => { setActiveTab('likes'); setExpandedFaqId(null); }}
                className={`pb-3 px-1 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all ${
                  activeTab === 'likes'
                    ? 'border-primary-500 text-primary-600 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                ❤️ Liked FAQs ({likedFaqs.length})
              </button>
              <button
                onClick={() => { setActiveTab('chats'); setExpandedFaqId(null); }}
                className={`pb-3 px-1 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all ${
                  activeTab === 'chats'
                    ? 'border-primary-500 text-primary-600 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                💬 Chat History ({chatSessions.length})
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-20">
                <div className="spinner" />
              </div>
            ) : (
              <>
                {/* ─── TAB 1: SAVED BOOKMARKS ─── */}
                {activeTab === 'bookmarks' && (
                  <>
                    {savedFaqs.length === 0 ? (
                      <div className="text-center py-16 text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800/80 rounded-2xl bg-slate-50/20 dark:bg-slate-950/5">
                        <span className="text-3xl mb-3 block">📖</span>
                        <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-300">No saved FAQs yet</h3>
                        <p className="text-xs text-slate-450 mt-1 max-w-sm mx-auto">
                          Browse the knowledge base and click the bookmark ribbon icon on any FAQ card to save it here for offline reading!
                        </p>
                        <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline mt-4">
                          Explore FAQs →
                        </Link>
                      </div>
                    ) : (
                      <ul className="divide-y divide-slate-150 dark:divide-slate-800/50 list-none pl-0">
                        {savedFaqs.map((faq, index) => {
                          const isExpanded = expandedFaqId === faq._id;
                          return (
                            <li key={faq._id} className={`${index > 0 ? 'pt-4.5' : ''} pb-4.5 group`}>
                              <div 
                                onClick={() => setExpandedFaqId(isExpanded ? null : faq._id)}
                                className="flex items-start justify-between gap-4 cursor-pointer"
                              >
                                <div className="flex-1">
                                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-primary-600 transition-colors leading-snug font-serif">
                                    • {faq.title}
                                  </h3>
                                  {faq.tags && faq.tags.length > 0 && (
                                    <span className="inline-block text-[9px] text-slate-400 mt-1 uppercase tracking-wider font-semibold">
                                      📁 {faq.tags[0]}
                                    </span>
                                  )}
                                </div>
                                <div className="shrink-0" onClick={e => e.stopPropagation()}>
                                  <button
                                    onClick={(e) => handleUnbookmark(e, faq._id)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
                                    title="Unsave bookmark"
                                  >
                                    <svg className="w-4 h-4" fill="currentColor" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                                    </svg>
                                  </button>
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="transition-all duration-300 mt-3 pl-3.5 border-l border-primary-300 dark:border-primary-900/60 animate-fadeIn">
                                  <p className="text-xs text-slate-600 dark:text-slate-350 leading-relaxed whitespace-pre-wrap font-sans select-text">
                                    {faq.finalAnswer}
                                  </p>
                                  <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-400 select-none">
                                    <span>Upvotes: {faq.upvotes || 0}</span>
                                    <span>•</span>
                                    <Link to={`/wiki?highlight=${faq._id}`} className="hover:underline text-primary-500">View in Wiki →</Link>
                                  </div>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                )}

                {/* ─── TAB 2: LIKED FAQS ─── */}
                {activeTab === 'likes' && (
                  <>
                    {likedFaqs.length === 0 ? (
                      <div className="text-center py-16 text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800/80 rounded-2xl bg-slate-50/20 dark:bg-slate-950/5">
                        <span className="text-3xl mb-3 block">❤️</span>
                        <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-300">No liked FAQs yet</h3>
                        <p className="text-xs text-slate-450 mt-1 max-w-sm mx-auto">
                          Show your appreciation! Upvote helpful FAQs across Grantha, and they will be listed here.
                        </p>
                        <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline mt-4">
                          Explore FAQs →
                        </Link>
                      </div>
                    ) : (
                      <ul className="divide-y divide-slate-150 dark:divide-slate-800/50 list-none pl-0">
                        {likedFaqs.map((faq, index) => {
                          const isExpanded = expandedFaqId === faq._id;
                          return (
                            <li key={faq._id} className={`${index > 0 ? 'pt-4.5' : ''} pb-4.5 group`}>
                              <div 
                                onClick={() => setExpandedFaqId(isExpanded ? null : faq._id)}
                                className="flex items-start justify-between gap-4 cursor-pointer"
                              >
                                <div className="flex-1">
                                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-primary-600 transition-colors leading-snug font-serif">
                                    ❤️ {faq.title}
                                  </h3>
                                  {faq.tags && faq.tags.length > 0 && (
                                    <span className="inline-block text-[9px] text-slate-400 mt-1 uppercase tracking-wider font-semibold font-sans">
                                      📁 {faq.tags[0]}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="transition-all duration-300 mt-3 pl-3.5 border-l border-primary-300 dark:border-primary-900/60 animate-fadeIn">
                                  <p className="text-xs text-slate-600 dark:text-slate-350 leading-relaxed whitespace-pre-wrap font-sans select-text">
                                    {faq.finalAnswer}
                                  </p>
                                  <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-400 select-none font-sans">
                                    <span>Total upvotes: {faq.upvotes || 0}</span>
                                    <span>•</span>
                                    <Link to={`/wiki?highlight=${faq._id}`} className="hover:underline text-primary-500">View in Wiki →</Link>
                                  </div>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                )}

                {/* ─── TAB 3: CHAT HISTORY ─── */}
                {activeTab === 'chats' && (
                  <>
                    {chatSessions.length === 0 ? (
                      <div className="text-center py-16 text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800/80 rounded-2xl bg-slate-50/20 dark:bg-slate-950/5">
                        <span className="text-3xl mb-3 block">💬</span>
                        <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-300">No chat history yet</h3>
                        <p className="text-xs text-slate-450 mt-1 max-w-sm mx-auto">
                          Open the RAG Chat widget and type a query. Conversations started while logged-in will be automatically saved here.
                        </p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-slate-150 dark:divide-slate-800/50 list-none pl-0">
                        {chatSessions.map((session, index) => {
                          const dateText = new Date(session.updatedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          });
                          return (
                            <li key={session._id} className={`${index > 0 ? 'pt-4' : ''} pb-4 flex items-center justify-between gap-4 group`}>
                              <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate font-serif">
                                  💬 {session.title}
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-sans">
                                  Last active: {dateText}
                                </p>
                              </div>
                              <button
                                onClick={() => handleResumeChat(session._id)}
                                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-850 hover:bg-primary-50 hover:text-primary-700 hover:border-primary-200 transition-all text-xs font-semibold font-sans select-none"
                              >
                                Resume
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
