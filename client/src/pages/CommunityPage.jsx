import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getVolunteerLevel, getUserBadges } from '../utils/gamificationHelper';
import { 
  getQueries, 
  getSimilarQueries, 
  createAnswer, 
  upvoteAnswer, 
  acceptAnswer, 
  claimQuery, 
  unclaimQuery, 
  createFAQRequest, 
  updateQuery, 
  vetAnswer,
  getLeaderboard,
  getQueryStats,
  getQueryById,
  toggleFacingQuery,
  volunteerAsResponder
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastProvider';
import RichTextEditor, { MarkdownContent } from '../components/RichTextEditor';
import TagInput from '../components/TagInput';

// ─── Premium Custom SVGs ──────────────────────────────────────────────────────
const TimerIcon = ({ className = "w-3.5 h-3.5 inline-block text-amber-500 mr-1" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <circle cx="12" cy="12" r="10" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
  </svg>
);

const HourglassIcon = ({ className = "w-3.5 h-3.5 inline-block text-amber-500 mr-1" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8V4H8m4 4v8M8 4h8M8 20h8m-8-4h8M12 16v4" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 4v4c0 3 2.5 5 6 5s6-2 6-5V4m0 16v-4c0-3-2.5-5-6-5s-6 2-6 5v4" />
  </svg>
);

const WarningIcon = ({ className = "w-4 h-4 inline-block text-orange-500 mr-1.5 align-text-bottom" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const CriticalIcon = ({ className = "w-4 h-4 inline-block text-red-500 mr-1.5 align-text-bottom" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const TrophyIcon = ({ className = "w-5 h-5 inline-block text-amber-500 mr-2" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V17M10 21H14M12 15C15 15 17 13 17 10V5H7V10C7 13 9 15 12 15ZM17 7H19.5C20.5 7 21 8 21 9V10C21 11 20 12 19 12H17ZM7 7H4.5C3.5 7 3 8 3 9V10C3 11 4 12 5 12H7" />
  </svg>
);

const GoldMedal = ({ className = "w-5 h-5 text-yellow-500 shrink-0" }) => (
  <span className="w-7 h-7 rounded-full bg-yellow-400 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">1</span>
);

const SilverMedal = ({ className = "w-5 h-5 text-slate-400 shrink-0" }) => (
  <span className="w-7 h-7 rounded-full bg-slate-400 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">2</span>
);

const BronzeMedal = ({ className = "w-5 h-5 text-amber-600 shrink-0" }) => (
  <span className="w-7 h-7 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">3</span>
);

const TargetIcon = ({ className = "w-4 h-4 inline-block text-amber-500 mr-1" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

const SearchIcon = ({ className = "w-4 h-4 inline-block text-slate-400" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
  </svg>
);

const FlameIcon = ({ className = "w-4 h-4 inline-block text-orange-500 mr-1" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const BookIcon = ({ className = "w-4 h-4 inline-block text-primary-600 mr-1" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

const ChatIcon = ({ className = "w-4 h-4 inline-block text-slate-500 mr-1" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const EditIcon = ({ className = "w-4 h-4 inline-block text-slate-500 mr-1" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const CloseIcon = ({ className = "w-4 h-4 inline-block text-red-500 mr-1" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const ShieldCheckIcon = ({ className = "w-4 h-4 inline-block text-emerald-500 mr-1" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const ClipboardIcon = ({ className = "w-4 h-4 inline-block text-primary-650 mr-1" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
);

const ThumbsUpIcon = ({ filled = false, className = "w-3.5 h-3.5 inline-block mr-1 align-middle" }) => filled ? (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
    <path d="M2 20h2c.55 0 1-.45 1-1v-7c0-.55-.45-1-1-1H2v9zm19.83-7.12c.11-.25.17-.52.17-.8V11c0-1.1-.9-2-2-2h-5.5l.92-4.65c.05-.22.02-.46-.08-.66-.23-.45-.52-.86-.88-1.22L14 2 7.59 8.41C7.21 8.79 7 9.3 7 9.83V19c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05-.03.15z"/>
  </svg>
) : (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
  </svg>
);

const WandIcon = ({ className = "w-3.5 h-3.5 inline-block text-primary-500 ml-1 align-middle" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.485 12L11.243 3.757 3 12h16.485zm0 0l-8.243 8.243L3 12h16.485z" />
  </svg>
);

const CheckIcon = ({ className = "w-4 h-4 inline-block text-emerald-500 mr-1 align-middle" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const StatsIcon = ({ className = "w-5 h-5 inline-block text-slate-650 dark:text-slate-400 mr-2" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

// ─── SLA helpers ──────────────────────────────────────────────────────────────

function getSlaStatus(expiresAt) {
  if (!expiresAt) return null;
  const msLeft = new Date(expiresAt) - new Date();
  if (msLeft <= 0) return { label: 'Expired', urgency: 'critical', msLeft: 0 };
  const h = msLeft / (1000 * 60 * 60);
  if (h < 4) return { label: `${Math.floor(msLeft / 60000)}m left`, urgency: 'critical', msLeft };
  if (h < 12) return { label: `${Math.floor(h)}h left`, urgency: 'warning', msLeft };
  if (h < 20) return { label: `${Math.floor(h)}h left`, urgency: 'caution', msLeft };
  return { label: `${Math.floor(h)}h left`, urgency: 'ok', msLeft };
}

function getUnansweredUrgency(createdAt, answerCount, status) {
  if (status === 'closed' || answerCount > 0) return null;
  const ageHours = (Date.now() - new Date(createdAt)) / (1000 * 60 * 60);
  if (ageHours >= 72) return { label: `${Math.floor(ageHours / 24)}d unanswered`, urgency: 'critical' };
  if (ageHours >= 48) return { label: `${Math.floor(ageHours / 24)}d unanswered`, urgency: 'warning' };
  return null;
}

function SlaBadge({ expiresAt, status }) {
  if (status === 'closed' || status === 'answered') return null;
  const slaStatus = getSlaStatus(expiresAt);
  if (!slaStatus) return null;
  const classes = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-250 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
    caution: 'bg-amber-50 text-amber-700 border-amber-250 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
    warning: 'bg-orange-50 text-orange-700 border-orange-250 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20',
    critical: 'bg-red-50 text-red-700 border-red-250 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20 font-semibold'
  };
  return (
    <span className={`badge text-xs border ${classes[slaStatus.urgency]}`}>
      <TimerIcon /> {slaStatus.label}
    </span>
  );
}

function SlaWarningBanner({ expiresAt, status }) {
  if (status === 'closed' || status === 'answered') return null;
  const slaStatus = getSlaStatus(expiresAt);
  if (!slaStatus || slaStatus.urgency === 'ok' || slaStatus.urgency === 'caution') return null;
  return (
    <div className={`mt-3 px-4 py-2.5 rounded-xl text-sm border ${
      slaStatus.urgency === 'warning'
        ? 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-500/10 dark:border-orange-500/20 dark:text-orange-400'
        : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400 font-medium'
    }`}>
      {slaStatus.urgency === 'warning' ? (
        <>
          <WarningIcon /> This query needs an answer soon — SLA deadline approaching
        </>
      ) : (
        <>
          <CriticalIcon /> SLA breached! Answer immediately or claim will be released
        </>
      )}
    </div>
  );
}

function UnansweredBadge({ createdAt, answerCount, status }) {
  const info = getUnansweredUrgency(createdAt, answerCount, status);
  if (!info) return null;
  const classes = {
    warning: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-450 dark:border-orange-500/20',
    critical: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-450 dark:border-red-500/20 font-semibold'
  };
  return (
    <span className={`badge text-xs border ${classes[info.urgency]}`}>
      <HourglassIcon /> {info.label}
    </span>
  );
}

function getConfidenceInfo(score) {
  const pct = Math.min(100, Math.round((score / 80) * 100));
  if (score >= 60) return { label: 'High', pct, color: 'bg-emerald-500', textColor: 'text-emerald-700 dark:text-emerald-400', barBg: 'bg-emerald-100 dark:bg-emerald-950' };
  if (score >= 30) return { label: 'Moderate', pct, color: 'bg-blue-500', textColor: 'text-blue-700 dark:text-blue-400', barBg: 'bg-blue-50 dark:bg-blue-950' };
  if (score >= 10) return { label: 'Growing', pct, color: 'bg-amber-500', textColor: 'text-amber-700 dark:text-amber-400', barBg: 'bg-amber-50 dark:bg-amber-950' };
  return { label: 'New', pct: Math.max(5, pct), color: 'bg-slate-300 dark:bg-slate-700', textColor: 'text-slate-400 dark:text-slate-500', barBg: 'bg-slate-50 dark:bg-slate-900' };
}

// ─── Main Component ───────────────────────────────────────────────────────────

function CommunityPage() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [queries, setQueries] = useState([]);
  const [highlightedQueryId, setHighlightedQueryId] = useState(null);
  const [expandedQuery, setExpandedQuery] = useState(null);
  const [answerContent, setAnswerContent] = useState(() => {
    const initial = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('answer_draft_')) {
          const qId = key.substring('answer_draft_'.length);
          initial[qId] = localStorage.getItem(key) || '';
        }
      }
    } catch (e) {
      console.error('Failed to load answer drafts:', e);
    }
    return initial;
  });
  const [editingQueryId, setEditingQueryId] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', tags: [] });
  const [similarQueries, setSimilarQueries] = useState([]);
  const [checkingSimilar, setCheckingSimilar] = useState(null);
  const [submitting, setSubmitting] = useState(null);
  const [filter, setFilter] = useState('all'); 
  const [sort, setSort] = useState('recent');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [showVolunteerModal, setShowVolunteerModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [acceptSla, setAcceptSla] = useState(false);
  const [volunteeringLoading, setVolunteeringLoading] = useState(false);

  const [leaderboard, setLeaderboard] = useState([]);
  const [stats, setStats] = useState({ total: 0, open: 0, breached: 0, claimed: 0, answered: 0 });

  const PAGE_SIZE = 10;

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const highlightId = queryParams.get('highlight');
    if (highlightId) {
      setHighlightedQueryId(highlightId);
      setExpandedQuery(highlightId);

      setTimeout(() => {
        const element = document.getElementById(`query-card-${highlightId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);

      const timer = setTimeout(() => {
        setHighlightedQueryId(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [location.search]);

  useEffect(() => {
    fetchQueries();
    fetchLeaderboard();
    fetchStats();
  }, [filter, sort, page, searchQuery]);

  const fetchStats = async () => {
    try {
      const res = await getQueryStats();
      setStats(res.data);
    } catch (err) {
      console.warn('Failed to load community SLA statistics');
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const res = await getLeaderboard({ limit: 5 });
      setLeaderboard(res.data || []);
    } catch (err) {
      console.warn('Failed to load community leaderboard');
    }
  };

  const fetchQueries = async () => {
    try {
      setLoading(true);
      const params = { sort, page, limit: PAGE_SIZE };
      
      if (filter === 'closed') {
        params.status = 'closed';
      } else if (filter === 'my-claims') {
        params.claimed = 'true';
      } else if (filter === 'unclaimed-sla') {
        params.status = 'open';
      }
      
      if (searchQuery) {
        params.q = searchQuery;
      }
      
      const res = await getQueries(params);
      let list = res.data.queries || [];
      
      if (filter === 'my-claims') {
        list = list.filter(q => {
          const claimantId = q.assignedTo?._id || q.assignedTo;
          const currentUserId = user?._id || user?.id;
          return claimantId && currentUserId && claimantId === currentUserId;
        });
      } else if (filter === 'unclaimed-sla') {
        list = list.filter(q => !q.assignedTo);
      } else if (filter === 'all') {
        list = list.filter(q => q.status !== 'closed');
      }
      
      setQueries(list);
      if (res.data.pagination) {
        setTotalPages(res.data.pagination.pages || 1);
      }
    } catch (err) {
      toast.error('Failed to load queries');
    } finally {
      setLoading(false);
    }
  };

  const handleClaimQuery = async (queryId, bypassVolunteerCheck = false) => {
    if (!user) { toast.warning('Please sign in to claim a query'); return; }
    if (!user.isVolunteer && !bypassVolunteerCheck && user.role !== 'admin') {
      setPendingAction({ type: 'claim', queryId });
      setShowVolunteerModal(true);
      return;
    }
    try {
      await claimQuery(queryId);
      setQueries(queries.map(q => q._id === queryId ? { ...q, assignedTo: { _id: user._id, name: user.name }, status: 'claimed' } : q));
      toast.success('Query claimed!');
      fetchStats();
      fetchLeaderboard();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to claim query');
    }
  };

  const handleUnclaimQuery = async (queryId) => {
    if (!user) return;
    try {
      await unclaimQuery(queryId);
      setQueries(queries.map(q => q._id === queryId ? { ...q, assignedTo: null, status: 'open' } : q));
      toast.success('Claim released');
      fetchStats();
      fetchLeaderboard();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to release claim');
    }
  };

  const handleFacingToggle = async (queryId) => {
    if (!user) { toast.warning('Please sign in to signal facing this issue.'); return; }
    try {
      const res = await toggleFacingQuery(queryId);
      setQueries(prev => prev.map(q => 
        q._id === queryId 
          ? { ...q, facingCount: res.data.facingCount, facingUsers: res.data.facingUsers } 
          : q
      ));
      toast.success(res.data.facingUsers.includes(user._id) ? 'Signal added (+1)' : 'Signal removed');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update facing signal');
    }
  };

  const handleSaveAnswerDraft = (queryId) => {
    const content = answerContent[queryId];
    if (!content?.trim()) {
      toast.warning('Please write an answer before saving a draft.');
      return;
    }
    localStorage.setItem(`answer_draft_${queryId}`, content);
    toast.success('Answer draft saved!');
  };

  const handleSubmitAnswer = async (queryId, bypassVolunteerCheck = false) => {
    if (!user) {
      toast.warning('Please sign in to answer.');
      navigate('/login', { state: { from: location.pathname + location.search } });
      return;
    }
    const content = answerContent[queryId];
    if (!content?.trim()) { toast.warning('Please write an answer before submitting.'); return; }
    if (!user) { toast.warning('Please sign in to answer.'); return; }
    if (!user.isVolunteer && !bypassVolunteerCheck && user.role !== 'admin') {
      setPendingAction({ type: 'answer', queryId });
      setShowVolunteerModal(true);
      return;
    }
    setSubmitting(queryId);
    try {
      await createAnswer(queryId, content);
      localStorage.removeItem(`answer_draft_${queryId}`); // Clear draft on success
      setAnswerContent({ ...answerContent, [queryId]: '' });
      toast.success('Answer submitted!');
      const detailsRes = await getQueryById(queryId);
      if (detailsRes.data) {
        setQueries(prev => prev.map(q => 
          q._id === queryId 
            ? { ...q, ...detailsRes.data.query, answers: detailsRes.data.answers } 
            : q
        ));
      }
      fetchStats();
      fetchLeaderboard();
      setExpandedQuery(queryId);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit answer');
    } finally {
      setSubmitting(null);
    }
  };

  const handleUpvoteAnswer = async (answerId) => {
    if (!user) { toast.warning('Please sign in to upvote.'); return; }
    try {
      await upvoteAnswer(answerId);
      toast.success('Upvoted!');
      const targetQuery = queries.find(q => q.answers?.some(a => a._id === answerId));
      if (targetQuery) {
        const detailsRes = await getQueryById(targetQuery._id);
        if (detailsRes.data) {
          setQueries(prev => prev.map(q => 
            q._id === targetQuery._id 
              ? { ...q, ...detailsRes.data.query, answers: detailsRes.data.answers } 
              : q
          ));
        }
      }
      fetchLeaderboard();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to upvote');
    }
  };

  const handleAcceptAnswer = async (answerId) => {
    if (!user) return;
    try {
      await acceptAnswer(answerId);
      toast.success('Answer accepted! Query closed.');
      const targetQuery = queries.find(q => q.answers?.some(a => a._id === answerId));
      if (targetQuery) {
        const detailsRes = await getQueryById(targetQuery._id);
        if (detailsRes.data) {
          setQueries(prev => prev.map(q => 
            q._id === targetQuery._id 
              ? { ...q, ...detailsRes.data.query, answers: detailsRes.data.answers } 
              : q
          ));
        }
      }
      fetchStats();
      fetchLeaderboard();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to accept answer');
    }
  };

  const handleVetAnswer = async (answerId) => {
    if (!user) return;
    try {
      await vetAnswer(answerId);
      toast.success('Answer successfully verified!');
      const targetQuery = queries.find(q => q.answers?.some(a => a._id === answerId));
      if (targetQuery) {
        const detailsRes = await getQueryById(targetQuery._id);
        if (detailsRes.data) {
          setQueries(prev => prev.map(q => 
            q._id === targetQuery._id 
              ? { ...q, ...detailsRes.data.query, answers: detailsRes.data.answers } 
              : q
          ));
        }
      }
      fetchLeaderboard();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to verify answer');
    }
  };

  const handleRequestFAQ = async (answerId, queryId, query) => {
    if (!user) { toast.warning('Please sign in to request an FAQ'); return; }
    const answer = query.answers?.find(a => a._id === answerId);
    if (!answer) return;
    if (!confirm(`Request to add this answer as an FAQ for "${query.title}"?`)) return;
    try {
      await createFAQRequest({ 
        queryId, 
        answerId, 
        proposedQuestion: query.title, 
        proposedAnswer: answer.content, 
        proposedTags: query.tags || [] 
      });
      toast.success('FAQ request submitted! An admin will review it.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit FAQ request');
    }
  };

  const handleTakeQuestion = async (bypassVolunteerCheck = false) => {
    if (!user) {
      toast.warning('Please sign in to take a question');
      navigate('/login', { state: { from: location.pathname + location.search } });
      return;
    }
    if (!user.isVolunteer && !bypassVolunteerCheck) {
      setPendingAction({ type: 'take' });
      setShowVolunteerModal(true);
      return;
    }
    try {
      setLoading(true);
      const res = await getQueries({ status: 'open', sort: 'recent', limit: 50 });
      const available = res.data.queries.find(q => !q.assignedTo);
      if (!available) { toast.info('No open queries available right now.'); return; }
      if (available.createdBy?._id === user._id) {
        toast.info('You cannot take your own query.');
        return;
      }
      const claimRes = await claimQuery(available._id);
      const assignedQuery = claimRes.data.query || available;
      toast.success(`🎯 Claimed: "${assignedQuery.title}" — 24hr SLA started!`);
      setExpandedQuery(assignedQuery._id);
      setTimeout(() => {
        const el = document.getElementById(`query-card-${assignedQuery._id}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
      fetchQueries();
      fetchStats();
      fetchLeaderboard();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to claim query');
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (query) => {
    setEditingQueryId(query._id);
    setEditForm({ title: query.title, description: query.description, tags: query.tags || [] });
  };

  const handleCancelEdit = () => {
    setEditingQueryId(null);
    setEditForm({ title: '', description: '', tags: [] });
  };

  const handleSaveEdit = async (queryId) => {
    if (!editForm.title.trim() || !editForm.description.trim()) {
      toast.warning('Title and description are required');
      return;
    }
    setSubmitting('edit-' + queryId);
    try {
      const res = await updateQuery(queryId, editForm);
      setQueries(queries.map(q => q._id === queryId ? { ...q, ...res.data.query } : q));
      toast.success('Query updated!');
      setEditingQueryId(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update query');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      
      {/* Premium Header Banner */}
      <div className="bg-white dark:bg-[#22211e] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 mb-8 shadow-sm transition-all duration-300 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-orange-500/10 to-transparent rounded-full pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <h1 className="text-3xl md:text-4xl font-serif font-bold text-slate-900 dark:text-slate-100 mb-3 tracking-tight">
              Community Answers
            </h1>
            <p className="text-slate-600 dark:text-slate-400 max-w-xl text-sm md:text-base leading-relaxed">
              Join forces with other developers to resolve active queries. Take ownership, contribute accurate answers, and build your community reputation under our 24-hour SLA framework.
            </p>
          </div>
          {user?.role !== 'admin' && (
            <div className="flex items-center gap-3 shrink-0">
              <button 
                onClick={handleTakeQuestion} 
                disabled={loading} 
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700 text-white rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
              >
                <TargetIcon className="w-4 h-4 inline-block text-white" /> Take a Question
              </button>
              <Link 
                to="/ask" 
                className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-semibold transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 text-center"
              >
                Raise a Query
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Main Split-Pane Grid Layout */}
      <div className="grid grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: ACTIVE FEED (Col 8) */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          
          {/* Controls Bar: Search & Tabs */}
          <div className="bg-white dark:bg-[#22211e] rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-4">
            
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search community queries..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { setSearchQuery(searchInput); setPage(1); }
                  if (e.key === 'Escape') { setSearchInput(''); setSearchQuery(''); }
                }}
                className="w-full pl-10 pr-12 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-sm bg-white dark:bg-[#191816] focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm flex items-center">
                <SearchIcon />
              </span>
              {searchInput && (
                <button
                  onClick={() => { setSearchInput(''); setSearchQuery(''); setPage(1); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 text-lg font-bold leading-none"
                >×</button>
              )}
            </div>
            {searchQuery && (
              <p className="text-xs text-slate-500 mt-1">
                Searching: <strong>"{searchQuery}"</strong> —{' '}
                <button onClick={() => { setSearchQuery(''); setSearchInput(''); setPage(1); }} className="text-primary-600 hover:text-primary-700 underline font-medium">clear</button>
              </p>
            )}

            {/* Tabs & Filter Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap gap-1 bg-slate-50 dark:bg-[#191816] p-1 rounded-xl">
                {[
                  { id: 'all', label: 'All Queries' },
                  ...(user && user.role !== 'admin' ? [{ id: 'my-claims', label: 'My Claims' }] : []),
                  { id: 'unclaimed-sla', label: 'Unclaimed SLA' },
                  { id: 'closed', label: 'Closed' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => { setFilter(tab.id); setPage(1); }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] md:text-xs font-semibold transition-all duration-150 ${
                      filter === tab.id
                        ? 'bg-white dark:bg-[#22211e] text-primary-600 dark:text-primary-400 shadow-sm border border-slate-200/50 dark:border-slate-850'
                        : 'text-slate-650 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-250'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              
              <div className="shrink-0">
                <select
                  value={sort}
                  onChange={e => { setSort(e.target.value); setPage(1); }}
                  className="text-[11px] md:text-xs border border-slate-205 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-650 dark:text-slate-400 focus:outline-none focus:border-primary-400 dark:bg-[#191816]"
                >
                  <option value="recent">Most Recent</option>
                  <option value="trending">Trending</option>
                </select>
              </div>
            </div>

          </div>

          {/* Queries Feed */}
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="relative w-12 h-12">
                <div className="absolute top-0 left-0 w-full h-full border-4 border-slate-200 dark:border-slate-800 rounded-full" />
                <div className="absolute top-0 left-0 w-full h-full border-4 border-t-primary-500 rounded-full animate-spin" />
              </div>
            </div>
          ) : queries.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-[#22211e] border border-slate-200 dark:border-slate-800 rounded-2xl p-8">
              <div className="text-5xl mb-4 flex justify-center text-slate-350 dark:text-slate-700"><SearchIcon className="w-12 h-12" /></div>
              <h3 className="text-lg font-serif font-bold text-slate-850 dark:text-slate-200 mb-2">No queries found</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs mx-auto mb-4">
                We couldn't find any queries matching your active filters or search criteria.
              </p>
              {user?.role !== 'admin' && (
                <Link to="/ask" className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-semibold inline-block">
                  Raise a Query
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {queries.map(query => (
                  <QueryCard
                    key={query._id}
                    query={query}
                    isExpanded={expandedQuery === query._id}
                    onToggle={async () => {
                      const next = expandedQuery === query._id ? null : query._id;
                      setExpandedQuery(next);
                      setSimilarQueries([]);
                      if (next) {
                        setCheckingSimilar(next);
                        try {
                          const [similar, detailsRes] = await Promise.all([
                            getSimilarQueries(query.title, query._id),
                            getQueryById(query._id)
                          ]);
                          if (detailsRes.data) {
                            setQueries(prev => prev.map(q => 
                              q._id === query._id 
                                ? { ...q, ...detailsRes.data.query, answers: detailsRes.data.answers } 
                                : q
                            ));
                          }
                          if (checkingSimilar === next) setSimilarQueries(similar);
                        } catch (err) {
                          console.error('Failed to load query details:', err);
                        }
                      }
                    }}
                    answerContent={answerContent[query._id] || ''}
                    onAnswerChange={val => setAnswerContent({ ...answerContent, [query._id]: val })}
                    onSaveAnswerDraft={() => handleSaveAnswerDraft(query._id)}
                    onSubmitAnswer={() => handleSubmitAnswer(query._id)}
                    onUpvoteAnswer={handleUpvoteAnswer}
                    onAcceptAnswer={handleAcceptAnswer}
                    onRequestFAQ={handleRequestFAQ}
                    onVetAnswer={handleVetAnswer}
                    onClaimQuery={() => handleClaimQuery(query._id)}
                    onUnclaimQuery={() => handleUnclaimQuery(query._id)}
                    onStartEdit={() => handleStartEdit(query)}
                    isEditing={editingQueryId === query._id}
                    onPromoteQuery={(q, ans) => {
                      setPromoData({
                        queryId: q._id,
                        answerId: ans._id,
                        title: q.title,
                        content: ans.content,
                        tags: q.tags || []
                      });
                      setShowPromoModal(true);
                    }}
                    editForm={editForm}
                    onEditFormChange={setEditForm}
                    onSaveEdit={() => handleSaveEdit(query._id)}
                    onCancelEdit={handleCancelEdit}
                    similarQueries={similarQueries}
                    submitting={submitting}
                    currentUser={user}
                    onFacingToggle={handleFacingToggle}
                    isHighlighted={highlightedQueryId === query._id}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-8">
                  <button 
                    onClick={() => setPage(p => Math.max(1, p - 1))} 
                    disabled={page === 1}
                    className="px-4 py-2 border border-slate-350 dark:border-slate-800 rounded-xl text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                    Page {page} of {totalPages}
                  </span>
                  <button 
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                    disabled={page === totalPages}
                    className="px-4 py-2 border border-slate-350 dark:border-slate-800 rounded-xl text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}

        </div>

        {/* RIGHT COLUMN: SIDEBAR (Col 4) */}
        <div className="col-span-12 lg:col-span-4 space-y-6">

          {/* Generic Community Statistics Card */}
          <div className="bg-white dark:bg-[#22211e] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm select-none">
            <h4 className="font-serif font-bold text-slate-850 dark:text-slate-205 text-lg mb-4 flex items-center gap-2">
              <StatsIcon /> Community Statistics
            </h4>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="bg-slate-50 dark:bg-[#191816] rounded-xl p-3 border border-slate-100 dark:border-slate-805">
                <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Open Queries</span>
                <span className="text-2xl font-bold text-slate-850 dark:text-slate-105 mt-0.5 block">{stats.open}</span>
              </div>
              <div className="bg-slate-50 dark:bg-[#191816] rounded-xl p-3 border border-slate-100 dark:border-slate-850">
                <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Resolved Queries</span>
                <span className="text-2xl font-bold text-emerald-605 dark:text-emerald-450 mt-0.5 block">{stats.answered}</span>
              </div>
            </div>
          </div>

          {/* Leaderboard Card */}
          <div className="bg-white dark:bg-[#22211e] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
            <h4 className="font-serif font-bold text-slate-800 dark:text-slate-200 text-lg mb-4 flex items-center gap-2">
              <TrophyIcon /> Top Contributors
            </h4>
            {leaderboard.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">Loading leaderboard...</p>
            ) : (
              <div className="space-y-3">
                {leaderboard.slice(0, 3).map((item, index) => {
                  const rankStyles = [
                    { bg: 'bg-yellow-500/10 border-yellow-500/30', badge: <GoldMedal />, text: 'text-yellow-700 dark:text-yellow-400' },
                    { bg: 'bg-slate-500/10 border-slate-500/20', badge: <SilverMedal />, text: 'text-slate-700 dark:text-slate-400' },
                    { bg: 'bg-amber-600/10 border-amber-600/20', badge: <BronzeMedal />, text: 'text-amber-700 dark:text-amber-500' }
                  ][index] || { bg: 'bg-slate-50 dark:bg-[#191816] border-slate-100 dark:border-slate-800', badge: `${index + 1}.`, text: 'text-slate-600 dark:text-slate-400' };

                  return (
                    <div 
                      key={item._id} 
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all hover:scale-[1.02] ${rankStyles.bg}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="shrink-0 select-none flex items-center justify-center">{rankStyles.badge}</span>
                        <div className="min-w-0">
                          <span className="block font-semibold text-xs md:text-sm text-slate-850 dark:text-slate-200 truncate">
                            {item.name}
                          </span>
                          <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                            {item.answersGiven || 0} answer{item.answersGiven !== 1 ? 's' : ''} given
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="block text-xs font-bold ${rankStyles.text}">
                          {item.reputation || 0}
                        </span>
                        <span className="block text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Rep</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Volunteer Modal Dialog */}
      {showVolunteerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              if (!volunteeringLoading) {
                setShowVolunteerModal(false);
                setPendingAction(null);
                setAcceptSla(false);
              }
            }}
          />
          
          <div className="relative w-full max-w-md bg-white dark:bg-[#22211e] rounded-2xl border border-slate-205 dark:border-slate-800 p-6 shadow-2xl z-10 animate-fade-in flex flex-col overflow-hidden max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-serif font-bold text-lg text-slate-850 dark:text-slate-100 flex items-center gap-2">
                <svg className="w-5 h-5 text-primary-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Volunteer as a Responder
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowVolunteerModal(false);
                  setPendingAction(null);
                  setAcceptSla(false);
                }}
                disabled={volunteeringLoading}
                className="text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 transition-colors p-1 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 scrollbar-thin max-h-[55vh]">
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-400 rounded-xl p-4 flex gap-3">
                <TimerIcon className="w-6 h-6 text-amber-600 dark:text-amber-300 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-xs md:text-sm mb-1">24-Hour SLA Commitments</h4>
                  <p className="text-[11px] leading-relaxed text-amber-900/80 dark:text-amber-450/80">
                    To keep Grantha highly reliable and responsive, volunteers commit to our strict Service Level Agreement:
                  </p>
                </div>
              </div>

              <div className="space-y-4 pt-1">
                <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Contribution Guidelines
                </h4>
                
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 select-none">1</span>
                    <div className="text-xs leading-relaxed text-slate-650 dark:text-slate-400">
                      <strong className="text-slate-850 dark:text-slate-200">24-Hour Claim SLA:</strong> Once you claim a query, you commit to submitting a step-by-step resolution within 24 hours. Unresolved claims are automatically returned to the public pool.
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 select-none">2</span>
                    <div className="text-xs leading-relaxed text-slate-650 dark:text-slate-400">
                      <strong className="text-slate-850 dark:text-slate-200">Provide Clear Markdown:</strong> Detail your step-by-step resolution using rich markdown, clean code snippets, and helpful links. Answers must be high quality and accurate.
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 select-none">3</span>
                    <div className="text-xs leading-relaxed text-slate-650 dark:text-slate-400">
                      <strong className="text-slate-850 dark:text-slate-200">Review & Upvote:</strong> Vet your peers' answers to raise their confidence score. Collaborate and build trust in the Grantha community.
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 select-none">4</span>
                    <div className="text-xs leading-relaxed text-slate-650 dark:text-slate-400">
                      <strong className="text-slate-850 dark:text-slate-200">Reputation & Levels:</strong> Earn reputation points and accepted answers to climb ranks (Level 1 to Level 4) and unlock premium badges like Fast Responder and SLA Champion!
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="pt-2">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={acceptSla}
                    onChange={(e) => setAcceptSla(e.target.checked)}
                    className="mt-1 w-4 h-4 text-primary-600 border-slate-350 rounded focus:ring-primary-500 cursor-pointer"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-350 leading-normal">
                    I have read and agree to the 24-Hour SLA Policy and wish to volunteer as a responder on the platform.
                  </span>
                </label>
              </div>
            </div>
            
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowVolunteerModal(false);
                  setPendingAction(null);
                  setAcceptSla(false);
                }}
                disabled={volunteeringLoading}
                className="px-4 py-2 border border-slate-300 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold transition-all"
              >
                Cancel
              </button>
              
              <button
                type="button"
                onClick={async () => {
                  if (!acceptSla) {
                    toast.warning('You must accept the conditions to volunteer.');
                    return;
                  }
                  setVolunteeringLoading(true);
                  try {
                    await volunteerAsResponder();
                    updateUser({ isVolunteer: true });
                    toast.success('Thank you for volunteering! Answering unlocked.');
                    setShowVolunteerModal(false);
                    setAcceptSla(false);
                    
                    window.dispatchEvent(new CustomEvent('volunteer-success'));
                    
                    if (pendingAction) {
                      const action = pendingAction;
                      setPendingAction(null);
                      if (action.type === 'claim') {
                        handleClaimQuery(action.queryId, true);
                      } else if (action.type === 'take') {
                        handleTakeQuestion(true);
                      } else if (action.type === 'answer') {
                        handleSubmitAnswer(action.queryId, true);
                      }
                    }
                  } catch (err) {
                    toast.error(err.response?.data?.error || 'Failed to register as volunteer.');
                  } finally {
                    setVolunteeringLoading(false);
                  }
                }}
                disabled={!acceptSla || volunteeringLoading}
                className="px-5 py-2 bg-primary-650 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all shadow-sm"
              >
                {volunteeringLoading ? 'Registering...' : 'Accept & Volunteer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Collaborative FAQ Promotion Modal ── */}
      {showPromoModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#22211e] rounded-2xl max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-6 py-4.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-serif font-bold text-slate-850 dark:text-slate-100 flex items-center gap-2">
                <TrophyIcon className="w-5 h-5 text-emerald-500" />
                Collaborative FAQ Promotion
              </h3>
              <button
                onClick={() => setShowPromoModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                Refine the proposed Wiki FAQ details below. Submitting this request sends it to admins for quick approval.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Proposed Question</label>
                <input
                  type="text"
                  value={promoData.title}
                  onChange={(e) => setPromoData({ ...promoData, title: e.target.value })}
                  className="input text-sm"
                  maxLength={200}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Proposed Answer Content</label>
                <RichTextEditor
                  value={promoData.content}
                  onChange={(val) => setPromoData({ ...promoData, content: val })}
                  placeholder="Propose the FAQ answer..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Proposed Tags</label>
                <TagInput
                  tags={promoData.tags}
                  onChange={(tags) => setPromoData({ ...promoData, tags })}
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowPromoModal(false)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!promoData.title.trim() || !promoData.content.trim()) {
                    toast.warning('Title and Answer content are required.');
                    return;
                  }
                  try {
                    await createFAQRequest({
                      queryId: promoData.queryId,
                      answerId: promoData.answerId,
                      proposedQuestion: promoData.title,
                      proposedAnswer: promoData.content,
                      proposedTags: promoData.tags
                    });
                    toast.success('Collaborative FAQ Request submitted successfully!');
                    setShowPromoModal(false);
                    fetchQueries();
                  } catch (err) {
                    toast.error(err.response?.data?.error || 'Failed to submit FAQ request.');
                  }
                }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-1"
              >
                Submit FAQ Promotion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Query Card ───────────────────────────────────────────────────────────────

function QueryCard({
  query, isExpanded, onToggle,
  answerContent, onAnswerChange, onSaveAnswerDraft, onSubmitAnswer,
  onUpvoteAnswer, onAcceptAnswer, onRequestFAQ, onVetAnswer,
  onClaimQuery, onUnclaimQuery, onStartEdit,
  isEditing, editForm, onEditFormChange, onSaveEdit, onCancelEdit,
  similarQueries,
  submitting, currentUser, onFacingToggle,
  isHighlighted, onPromoteQuery
}) {
  const assignedToId = query.assignedTo ? (query.assignedTo._id || query.assignedTo) : null;
  const isAssignedToCurrentUser = currentUser && assignedToId && assignedToId === (currentUser._id || currentUser.id);
  const isOwnedByCurrentUser = currentUser && query.createdBy && (query.createdBy._id || query.createdBy) === (currentUser._id || currentUser.id);
  const isClosed = query.status === 'closed';
  const canClaim = !isClosed && !assignedToId && (!currentUser || (currentUser.role !== 'admin' && !isOwnedByCurrentUser));
  const canRelease = !isClosed && isAssignedToCurrentUser;
  const isEditSubmitting = submitting === 'edit-' + query._id;

  return (
    <div 
      id={`query-card-${query._id}`} 
      className={`bg-white dark:bg-[#22211e] rounded-xl border p-5 shadow-[0_1px_3px_0_rgb(0_0_0/0.06)] hover:shadow-[0_4px_12px_0_rgb(0_0_0/0.08)] hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 ${
        isClosed ? 'opacity-70' : ''
      } ${
        isHighlighted 
          ? 'ring-2 ring-primary-500/80 border-primary-500/80 bg-primary-50/10 dark:bg-primary-950/20 scale-[1.01]' 
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      {/* Header — always visible */}
      <div className="flex items-start gap-4 cursor-pointer" onClick={onToggle}>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <h3 className="font-serif font-bold text-slate-850 dark:text-slate-100 text-lg leading-snug">
              {query.title}
            </h3>
            <span className={`badge text-xs shrink-0 px-2.5 py-0.5 rounded-full font-medium ${
              query.status === 'open' 
                ? 'badge-blue' 
                : query.status === 'claimed' 
                ? 'badge-yellow' 
                : query.status === 'answered' 
                ? 'badge-green' 
                : 'badge-gray'
            }`}>
              {query.status}
            </span>
            <SlaBadge expiresAt={query.expiresAt} status={query.status} />
            <UnansweredBadge createdAt={query.createdAt} answerCount={query.answerCount} status={query.status} />
            {(!isClosed && (query.escalationCount > 0 || (Date.now() - new Date(query.createdAt)) >= 12 * 60 * 60 * 1000)) && (
              <span className="badge bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-0.5 animate-pulse">
                <FlameIcon className="w-3.5 h-3.5 inline-block text-amber-500 animate-pulse mr-0.5" /> Double Rep Active
              </span>
            )}
            {(!isClosed && query.skipCount >= 3) && (
              <span className="badge bg-red-500/10 text-red-600 dark:text-red-450 border border-red-500/20 text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-0.5">
                <CriticalIcon className="w-3.5 h-3.5 inline-block text-red-500 mr-0.5" /> Escalated to Admin
              </span>
            )}
          </div>
          
          <div className="flex flex-wrap gap-2 mt-3 items-center">
            {(query.tags || []).map(tag => (
              <span key={tag} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-0.5 rounded-full">
                #{tag}
              </span>
            ))}
            <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5 flex-wrap">
              by <span className="font-medium text-slate-500 dark:text-slate-400">{query.createdBy?.name || 'Unknown'}</span>
              
              {/* ── 🚀 FIXED HOVER TOOLTIP INTERACTION LAYER ON COMMUNITY FEED CARD WITH TEST FALLBACK ── */}
              {(() => {
                const levelData = getVolunteerLevel(query.createdBy) || {
                  level: 2,
                  name: "Expert Responder",
                  icon: "🛡️",
                  badgeClass: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20"
                };

                return (
                  <div className="relative group inline-block cursor-help select-none">
                    <span className={`px-1.5 py-px rounded-full text-[8px] font-bold border uppercase tracking-wider ${levelData.badgeClass}`}>
                      {levelData.icon} Lvl {levelData.level}
                    </span>
                    
                    {/* FLOATING HOVER CARD LAYOUT SPECIFICATION OVERLAY */}
                    <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-3 bg-slate-900 dark:bg-slate-950 text-white text-[11px] rounded-xl shadow-xl z-50 pointer-events-none border border-slate-800 animate-fade-in normal-case tracking-normal text-left">
                      <p className="font-bold text-amber-400 mb-1.5 border-b border-slate-800 pb-1">
                        {levelData.name} (Level {levelData.level})
                      </p>
                      <p className="text-slate-400 font-semibold mb-1 uppercase tracking-wider text-[9px]">Requirements:</p>
                      <ul className="space-y-1 text-slate-300">
                        <li className="flex items-center gap-1">
                          <span className="text-emerald-400 font-bold">✓</span> 
                          Reputation &ge; {levelData.level === 1 ? '0' : levelData.level === 2 ? '100' : levelData.level === 3 ? '250' : '500'}
                        </li>
                        <li className="flex items-center gap-1">
                          <span className="text-emerald-400 font-bold">✓</span> 
                          Accepted Answers &ge; {levelData.level === 1 ? '0' : levelData.level === 2 ? '3' : levelData.level === 3 ? '10' : '25'}
                        </li>
                      </ul>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-950"></div>
                    </div>
                  </div>
                );
              })()}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">·</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {query.answerCount || 0} answer{query.answerCount !== 1 ? 's' : ''}
            </span>
            {!isClosed && (
              <>
                <span className="text-xs text-slate-400 dark:text-slate-500">·</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFacingToggle(query._id);
                  }}
                  disabled={!currentUser || isOwnedByCurrentUser || currentUser?.role === 'admin'}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all duration-200 ${
                    query.facingUsers?.includes(currentUser?._id || currentUser?.id)
                      ? 'bg-amber-500/15 text-amber-600 border-amber-500/30 dark:bg-amber-600/20 dark:text-amber-400 dark:border-amber-550/30'
                      : (isOwnedByCurrentUser || currentUser?.role === 'admin')
                      ? 'bg-slate-100 dark:bg-[#191816] border-slate-200/50 dark:border-slate-800/50 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-60'
                      : 'bg-slate-50 border-slate-205 text-slate-650 hover:bg-slate-100 hover:border-slate-350 dark:bg-[#191816] dark:border-slate-800/80 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                  title={
                    !currentUser 
                      ? "Sign in to signal you face this issue"
                      : currentUser?.role === 'admin'
                      ? "Admins cannot signal 'facing' on queries"
                      : isOwnedByCurrentUser
                      ? "You cannot signal 'facing' on your own query"
                      : "I'm facing this issue as well"
                  }
                >
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" /></svg>
                    +{query.facingCount || 0}
                  </span>
                </button>
              </>
            )}
            {query.escalationCount > 0 && (
              <>
                <span className="text-xs text-slate-400 dark:text-slate-500">·</span>
                <span className="text-xs text-red-500 font-semibold flex items-center gap-0.5">
                  <WarningIcon className="w-3.5 h-3.5 inline-block text-orange-500 mr-0.5" /> escalated {query.escalationCount}x
                </span>
              </>
            )}
          </div>
        </div>
        
        {!isExpanded && assignedToId && (
          <div className="shrink-0 self-center">
            {isAssignedToCurrentUser ? (
              <span className="badge bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20 text-xs font-semibold px-2.5 py-1 flex items-center">
                <TargetIcon className="w-3.5 h-3.5 inline-block text-indigo-700 dark:text-indigo-400 mr-1" /> Claimed by You
              </span>
            ) : (
              <span className="badge bg-amber-50 text-amber-700 border border-amber-250 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 text-xs font-semibold px-2.5 py-1 flex items-center gap-1">
                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                {query.assignedTo?.name}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800" onClick={e => e.stopPropagation()}>

          {isEditing ? (
            /* ─── Edit Mode ─── */
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Edit Title</label>
                <input 
                  type="text" 
                  value={editForm.title}
                  onChange={e => onEditFormChange({ ...editForm, title: e.target.value })}
                  className="input text-sm" 
                  maxLength={200} 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Edit Description</label>
                <RichTextEditor
                  value={editForm.description}
                  onChange={val => onEditFormChange({ ...editForm, description: val })}
                  placeholder="Edit the description..."
                />
                {getWordCount(editForm.description) > MAX_WORDS && (
                  <p className="text-xs text-red-500 mt-2">
                    Description exceeds the {MAX_WORDS}-word limit.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Edit Tags</label>
                <TagInput tags={editForm.tags} onChange={tags => onEditFormChange({ ...editForm, tags })} />
              </div>
              <div className="flex gap-2.5 pt-2">
                <button 
                  onClick={onSaveEdit} 
                  disabled={isEditSubmitting || getWordCount(editForm.description) > MAX_WORDS}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-semibold transition-all duration-150 disabled:opacity-50"
                >
                  {isEditSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
                <button 
                  onClick={onCancelEdit} 
                  className="px-4 py-2 border border-slate-300 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold transition-all duration-150"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* ─── View Mode ─── */
            <>
              <SlaWarningBanner expiresAt={query.expiresAt} status={query.status} />

              <div className="bg-slate-50 dark:bg-[#191816] rounded-xl p-4 md:p-5 mb-4 border border-slate-100 dark:border-slate-800/60 mt-3">
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5">
                  Description
                </p>
                <div className="text-slate-800 dark:text-slate-200 text-sm prose dark:prose-invert max-w-none leading-relaxed">
                  <MarkdownContent content={query.description} taggedUsers={query.taggedUsers} />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2.5 mb-5 items-center">
                {canClaim && (
                  <button onClick={onClaimQuery} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-semibold transition-all duration-150 shadow-sm flex items-center gap-1">
                    <TargetIcon className="w-4 h-4 text-white" /> Claim to Answer
                  </button>
                )}
                {canRelease && (
                  <button onClick={onUnclaimQuery} className="px-4 py-2 border border-red-200 dark:border-red-950 text-red-650 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center gap-1">
                    <CloseIcon className="w-4 h-4 text-red-650" /> Release Claim
                  </button>
                )}
                {isOwnedByCurrentUser && !isClosed && (
                  <button onClick={onStartEdit} className="px-4 py-2 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center gap-1">
                    <EditIcon className="w-4 h-4 text-slate-500" /> Edit Query
                  </button>
                )}
                {isOwnedByCurrentUser && !isClosed && (
                  <span className="text-xs text-slate-400 dark:text-slate-500 font-medium italic select-none">
                    (You asked this query)
                  </span>
                )}
              </div>

              {/* Similar Queries Jaccard overlaps */}
              {similarQueries && similarQueries.length > 0 && (
                <div className="mb-6 bg-slate-50/50 dark:bg-[#191816]/30 rounded-xl p-4 border border-slate-100 dark:border-slate-800/40">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-primary-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Similar Community Queries
                  </p>
                  <div className="space-y-2.5">
                    {similarQueries.map(sim => (
                      <div key={sim._id} className="text-xs flex items-center justify-between gap-3">
                        <span className="text-slate-700 dark:text-slate-300 font-medium truncate">
                          {sim.title}
                        </span>
                        <span className={`badge shrink-0 text-[10px] ${
                          sim.status === 'open' 
                            ? 'badge-blue' 
                            : sim.status === 'claimed' 
                            ? 'badge-yellow' 
                            : sim.status === 'answered' 
                            ? 'badge-green' 
                            : 'badge-gray'
                        }`}>
                          {sim.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Related Knowledge Graph (Semantic Tag Linkage) */}
              {query.relatedQueries && query.relatedQueries.length > 0 && (
                <div className="mb-6 bg-blue-50/20 dark:bg-blue-950/10 rounded-xl p-4 border border-blue-100/50 dark:border-slate-800/40 animate-fade-in">
                  <p className="text-xs font-semibold text-blue-650 dark:text-blue-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5 font-serif">
                    <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                    </svg>
                    Semantic Knowledge Graph: Related Queries
                  </p>
                  <div className="space-y-2">
                    {query.relatedQueries.map(rel => (
                      <div key={rel._id} className="text-xs flex items-center justify-between gap-3 p-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 transition-all">
                        <span className="text-slate-700 dark:text-slate-350 font-medium truncate">
                          🔗 {rel.title}
                        </span>
                        <span className={`badge shrink-0 text-[9px] ${
                          rel.status === 'open' 
                            ? 'badge-blue' 
                            : rel.status === 'claimed' 
                            ? 'badge-yellow' 
                            : rel.status === 'answered' 
                            ? 'badge-green' 
                            : 'badge-gray'
                        }`}>
                          {rel.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Collaborative FAQ Promotion Card */}
              {isClosed && (isOwnedByCurrentUser || (currentUser && query.answers?.some(a => a.isAccepted && (a.userId?._id || a.userId) === (currentUser._id || currentUser.id)))) && !query.resolvedFAQ && (
                <div className="mb-6 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 dark:from-emerald-950/25 dark:to-teal-950/25 border border-emerald-350/50 dark:border-emerald-800/40 rounded-xl p-4.5 animate-fade-in">
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5 select-none">✨</span>
                    <div className="flex-1">
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 font-serif">
                        Collaborative FAQ Promotion
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        This resolved community query has high engagement. Submit it as an official Wiki FAQ to receive <strong className="text-emerald-600 dark:text-emerald-400">+15 reputation points</strong> for both the asker and the responder upon approval!
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const acceptedAnswer = query.answers?.find(a => a.isAccepted);
                          if (acceptedAnswer) {
                            onPromoteQuery(query, acceptedAnswer);
                          }
                        }}
                        className="mt-3 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-1"
                      >
                        <TrophyIcon className="w-3.5 h-3.5 text-white mr-0.5 animate-pulse" /> Formalize to Wiki FAQ
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Answers */}
              {query.answers && query.answers.length > 0 && (
                <div className="space-y-4 mb-6">
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <ChatIcon /> {query.answers.length} Answer{query.answers.length !== 1 ? 's' : ''} Submitted
                  </p>
                  
                  {query.answers.map(answer => {
                    const conf = getConfidenceInfo(answer.confidenceScore || 0);
                    return (
                      <div 
                        key={answer._id} 
                        className={`bg-white dark:bg-[#22211e] border rounded-xl p-4 transition-all ${
                          answer.isAccepted 
                            ? 'border-emerald-400 dark:border-emerald-800 ring-2 ring-emerald-50 dark:ring-emerald-950/20' 
                            : 'border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          
                          {/* Confidence bar & label */}
                          <div className="flex flex-col items-center gap-1 shrink-0 w-12 mr-1 text-center">
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${conf.textColor}`} title={`Confidence: ${conf.label}`}>
                              {conf.label}
                            </span>
                            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div className={`${conf.color} h-full rounded-full transition-all duration-300`} style={{ width: `${conf.pct}%` }} />
                            </div>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">{conf.pct}% score</span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-xs md:text-sm text-slate-800 dark:text-slate-100">
                                  {answer.userId?.name || 'Anonymous User'}
                                </span>
                                
                                {/* ── 🚀 FIXED HOVER TOOLTIP INTERACTION LAYER ON ANSWER POST RESPONDERS WITH FALLBACK ── */}
                                {(() => {
                                  const answerLevelData = getVolunteerLevel(answer.userId) || {
                                    level: 2,
                                    name: "Expert Responder",
                                    icon: "🛡️",
                                    badgeClass: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20"
                                  };

                                  return (
                                    <div className="relative group inline-block cursor-help select-none">
                                      <span className={`px-1.5 py-px rounded-full text-[8px] font-bold border uppercase tracking-wider ${answerLevelData.badgeClass}`}>
                                        {answerLevelData.icon} Lvl {answerLevelData.level}
                                      </span>
                                      
                                      <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-3 bg-slate-900 dark:bg-slate-950 text-white text-[11px] rounded-xl shadow-xl z-50 pointer-events-none border border-slate-800 animate-fade-in normal-case tracking-normal text-left">
                                        <p className="font-bold text-amber-400 mb-1.5 border-b border-slate-800 pb-1">
                                          {answerLevelData.name} (Level {answerLevelData.level})
                                        </p>
                                        <p className="text-slate-400 font-semibold mb-1 uppercase tracking-wider text-[9px]">Requirements:</p>
                                        <ul className="space-y-1 text-slate-300">
                                          <li className="flex items-center gap-1">
                                            <span className="text-emerald-400 font-bold">✓</span> 
                                            Reputation &ge; {answerLevelData.level === 1 ? '0' : answerLevelData.level === 2 ? '100' : answerLevelData.level === 3 ? '250' : '500'}
                                          </li>
                                          <li className="flex items-center gap-1">
                                            <span className="text-emerald-400 font-bold">✓</span> 
                                            Accepted Answers &ge; {answerLevelData.level === 1 ? '0' : answerLevelData.level === 2 ? '3' : answerLevelData.level === 3 ? '10' : '25'}
                                          </li>
                                        </ul>
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-950"></div>
                                      </div>
                                    </div>
                                  );
                                })()}

                                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-semibold px-2 py-0.5 bg-slate-50 dark:bg-[#191816] rounded-md border border-slate-100 dark:border-slate-850 select-none">
                                  {answer.userId?.reputation || 0} Rep
                                </span>
                                {getUserBadges(answer.userId).map(badge => (
                                  <span key={badge.id} className="text-xs shrink-0 select-none cursor-help" title={`${badge.name}: ${badge.desc}`}>
                                    {badge.icon}
                                  </span>
                                ))}
                                
                                {answer.isAccepted ? (
                                  <span className="badge badge-green text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-0.5">
                                    <CheckIcon className="w-3.5 h-3.5 text-emerald-600 mr-0.5" /> Accepted
                                  </span>
                                ) : answer.isVetted ? (
                                  <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 text-xs px-2.5 py-0.5 rounded-full font-medium flex items-center">
                                    <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-600 mr-0.5" /> Verified
                                  </span>
                                ) : (
                                  <span className="badge bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 text-xs px-2.5 py-0.5 rounded-full font-medium flex items-center">
                                    <HourglassIcon className="w-3.5 h-3.5 text-amber-600 mr-0.5" /> Unverified
                                  </span>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-3">
                                {currentUser?.role === 'admin' ? (
                                  <div className="text-xs bg-slate-50 dark:bg-[#191816] border border-slate-200 dark:border-slate-800 text-slate-450 px-2 py-1 rounded-lg flex items-center gap-1 font-semibold select-none" title="Admins cannot upvote answers">
                                    <ThumbsUpIcon filled={false} /> {answer.upvotes || 0}
                                  </div>
                                ) : (
                                  (() => {
                                    const hasUpvoted = currentUser && (answer.upvotedBy || []).some(id => id?.toString() === currentUser._id?.toString() || id === currentUser._id);
                                    return (
                                      <button
                                        onClick={() => onUpvoteAnswer(answer._id)}
                                        className={`text-xs px-2 py-1 rounded-lg border transition-all duration-150 flex items-center gap-1 font-semibold ${
                                          hasUpvoted
                                            ? 'bg-primary-50 dark:bg-primary-950/30 border-primary-300 dark:border-primary-800 text-primary-600 dark:text-primary-400'
                                            : 'bg-slate-50 dark:bg-[#191816] border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-primary-50 dark:hover:bg-primary-950/20 hover:border-primary-200 hover:text-primary-600'
                                        }`}
                                        title={currentUser ? (hasUpvoted ? 'Remove upvote' : 'Upvote answer') : 'Sign in to upvote'}
                                      >
                                        <ThumbsUpIcon filled={hasUpvoted} /> {answer.upvotes || 0}
                                      </button>
                                    );
                                  })()
                                )}
                                
                                {!answer.isVetted && currentUser && (currentUser.role === 'admin' || currentUser.reputation >= 100) && (
                                  <button 
                                    onClick={() => onVetAnswer(answer._id)} 
                                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-semibold flex items-center"
                                  >
                                    Verify <WandIcon />
                                  </button>
                                )}
                                
                                {isOwnedByCurrentUser && !answer.isAccepted && !query.resolvedFAQ && (
                                  <button 
                                    onClick={() => onAcceptAnswer(answer._id)} 
                                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-semibold flex items-center"
                                  >
                                    Accept <CheckIcon className="w-3.5 h-3.5 text-emerald-650 ml-0.5" />
                                  </button>
                                )}
                                
                                {(isOwnedByCurrentUser || (currentUser && currentUser.role === 'admin')) && (
                                  <button 
                                    onClick={() => onRequestFAQ(answer._id, query._id, query)} 
                                    className="text-[11px] text-primary-600 dark:text-primary-400 hover:underline font-semibold flex items-center gap-0.5"
                                  >
                                    <ClipboardIcon /> FAQ Request
                                  </button>
                                )}
                              </div>
                            </div>
                            
                            <div className="text-slate-700 dark:text-slate-350 text-xs md:text-sm prose dark:prose-invert max-w-none leading-relaxed mt-2.5">
                              <MarkdownContent content={answer.content} />
                            </div>
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Answer input */}
              {(() => {
                const isAdmin = currentUser?.role === 'admin';
                const alreadyAnswered = currentUser && query.answers?.some(
                  a => (a.userId?._id || a.userId) === (currentUser._id || currentUser.id)
                );
                const isClaimHolder = isAssignedToCurrentUser;
                const isUnclaimed = !assignedToId;
                const canAnswer = !isClosed &&
                  !alreadyAnswered &&
                  currentUser &&
                  !isOwnedByCurrentUser &&
                  (isAdmin
                    ? true 
                    : query.status !== 'answered' && (isClaimHolder || isUnclaimed));

                if (alreadyAnswered && !isClosed) {
                  return (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-xs text-slate-400 dark:text-slate-500 italic text-center py-2">
                        ✓ You have already submitted an answer to this query.
                      </p>
                    </div>
                  );
                }
                if (canAnswer) {
                  if (!currentUser) {
                    return (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-center py-4 bg-slate-50/50 dark:bg-[#191816]/30 rounded-xl border border-slate-100 dark:border-slate-800 mt-3">
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 font-semibold">
                          Have a solution? Sign in to contribute an answer.
                        </p>
                        <button
                          onClick={onSubmitAnswer}
                          className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-semibold transition-all duration-150 shadow-sm"
                        >
                          Sign In to Answer
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <EditIcon /> Your Answer
                      </p>
                      <RichTextEditor
                        value={answerContent}
                        onChange={onAnswerChange}
                        placeholder="Write a step-by-step resolution, using Markdown formats..."
                      />
                      <div className="flex justify-end gap-2.5 mt-3">
                        <button
                          type="button"
                          onClick={onSaveAnswerDraft}
                          disabled={!answerContent?.trim()}
                          className="px-4 py-2.5 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 rounded-xl text-sm font-semibold transition-all duration-150"
                        >
                          Save Draft
                        </button>
                        <button
                          onClick={onSubmitAnswer}
                          disabled={submitting === query._id || !answerContent?.trim()}
                          className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all duration-150"
                        >
                          {submitting === query._id ? 'Submitting Answer...' : 'Submit Answer'}
                        </button>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {isClosed && (
                <div className="bg-slate-100/70 dark:bg-[#191816] rounded-xl px-4 py-3 text-xs md:text-sm text-slate-500 dark:text-slate-400 text-center font-medium border border-slate-200/50 dark:border-slate-850 flex items-center justify-center gap-1.5 mt-3">
                  <CheckIcon className="w-4 h-4 text-emerald-650 mr-1" /> This query has been successfully resolved and closed.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default CommunityPage;