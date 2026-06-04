import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { getQueries, getQueryById } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastProvider';

export default function TrackQueryPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [queries, setQueries] = useState([]);
  const [selectedQuery, setSelectedQuery] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [queryDetails, setQueryDetails] = useState(null);

  const highlightId = searchParams.get('highlight');

  // Redirect admin users to admin dashboard
  useEffect(() => {
    if (user && user.role === 'admin') {
      navigate('/admin', { replace: true });
    }
  }, [user, navigate]);

  // 1. Fetch user's queries on mount
  useEffect(() => {
    if (!user || user.role === 'admin') return;

    setLoadingList(true);
    // Fetch queries raised by current user
    getQueries({ createdBy: user._id || user.id, limit: 100 })
      .then(res => {
        const userQueries = res.data.queries || [];
        setQueries(userQueries);

        // Auto-select highlightId if present, otherwise first query
        if (highlightId && userQueries.some(q => q._id === highlightId)) {
          const match = userQueries.find(q => q._id === highlightId);
          setSelectedQuery(match);
        } else if (userQueries.length > 0) {
          setSelectedQuery(userQueries[0]);
        }
      })
      .catch(err => {
        console.error('Failed to load queries:', err);
        toast.error('Failed to load queries list');
      })
      .finally(() => setLoadingList(false));
  }, [user, highlightId]);

  // 2. Fetch full query details (with answers) when selection changes
  useEffect(() => {
    if (!selectedQuery) {
      setQueryDetails(null);
      return;
    }

    setLoadingDetails(true);
    getQueryById(selectedQuery._id)
      .then(res => {
        setQueryDetails(res.data);
      })
      .catch(err => {
        console.error('Failed to fetch query details:', err);
        toast.error('Failed to load query details');
      })
      .finally(() => setLoadingDetails(false));
  }, [selectedQuery]);

  if (!user) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <p className="text-slate-600 dark:text-slate-400">Please sign in to track your queries.</p>
        <Link to="/login" className="btn-primary mt-4 inline-block">Sign In</Link>
      </div>
    );
  }

  // Helper to format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8 select-none">
        <h1 className="text-3xl font-serif font-bold text-slate-900 dark:text-slate-100 mb-2">Track Queries</h1>
        <p className="text-slate-600 dark:text-slate-400">Monitor resolution progress and SLA status for queries you have raised.</p>
      </div>

      <div className="grid grid-cols-12 gap-8 items-start">
        {/* Left Side: Queries List Sidebar */}
        <div className="col-span-12 md:col-span-4 space-y-4">
          <div className="bg-white dark:bg-[#22211e] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 select-none">
              Your Raised Queries ({queries.length})
            </h3>

            {loadingList ? (
              <div className="flex justify-center py-10"><div className="spinner" /></div>
            ) : queries.length === 0 ? (
              <div className="text-center py-10 select-none text-slate-400 dark:text-slate-500 text-sm">
                <p>You haven't raised any queries yet.</p>
                <Link to="/ask" className="text-primary-600 dark:text-primary-400 font-semibold hover:underline block mt-2">
                  Raise a new query →
                </Link>
              </div>
            ) : (
              <div className="space-y-1 max-h-[480px] overflow-y-auto pr-1 scrollbar-thin">
                {queries.map(q => {
                  const isActive = selectedQuery && selectedQuery._id === q._id;
                  return (
                    <button
                      key={q._id}
                      onClick={() => setSelectedQuery(q)}
                      className={`w-full text-left px-3.5 py-3 rounded-xl transition-all duration-150 flex flex-col gap-1 border ${
                        isActive
                          ? 'bg-primary-50/70 dark:bg-primary-950/20 text-primary-700 dark:text-primary-400 border-primary-200/50 dark:border-primary-900/20'
                          : 'border-transparent text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-900/40'
                      }`}
                    >
                      <span className="font-semibold text-sm line-clamp-1">{q.title}</span>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 w-full select-none mt-1">
                        <span>{formatDate(q.createdAt)}</span>
                        <span className={`px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          q.status === 'closed'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400'
                            : q.status === 'claimed'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400'
                              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-405'
                        }`}>
                          {q.status}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Timeline Visualization */}
        <div className="col-span-12 md:col-span-8">
          {selectedQuery ? (
            <div className="bg-white dark:bg-[#22211e] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm">
              {loadingDetails || !queryDetails ? (
                <div className="flex justify-center py-20"><div className="spinner" /></div>
              ) : (
                <div className="space-y-6">
                  {/* Title Block */}
                  <div className="border-b border-slate-100 dark:border-slate-800 pb-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-primary-600 dark:text-primary-400 select-none block mb-1">
                        Tracking Status
                      </span>
                      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
                        {queryDetails.query.title}
                      </h2>
                      <div className="flex flex-wrap gap-2.5 mt-2.5 items-center text-xs text-slate-450 dark:text-slate-500 select-none">
                        <span>Asked: {formatDate(queryDetails.query.createdAt)}</span>
                        <span>•</span>
                        <span>Category: {queryDetails.query.tags?.[0] || 'General'}</span>
                      </div>
                    </div>
                    <Link
                      to={`/community?highlight=${queryDetails.query._id}`}
                      className="btn-ghost text-xs py-2 px-3 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-xl shrink-0 font-semibold"
                    >
                      View in Forum →
                    </Link>
                  </div>

                  {/* Visual Timeline Tracker */}
                  <div className="relative pl-8 border-l-2 border-slate-100 dark:border-slate-800 space-y-8 select-none">
                    
                    {/* Step 1: Created */}
                    <div className="relative">
                      <div className="absolute -left-[41px] top-0.5 w-6 h-6 rounded-full bg-emerald-100 border-4 border-white dark:border-[#22211e] flex items-center justify-center text-emerald-605">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Query Raised</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-450 mt-0.5">
                          Your query has been successfully broadcast to the community board.
                        </p>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-1 block">
                          Completed • {formatDate(queryDetails.query.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Step 2: SLA Status */}
                    <div className="relative">
                      {/* Circle Indicator */}
                      <div className={`absolute -left-[41px] top-0.5 w-6 h-6 rounded-full border-4 border-white dark:border-[#22211e] flex items-center justify-center ${
                        queryDetails.query.status === 'closed'
                          ? 'bg-emerald-100 text-emerald-600'
                          : new Date(queryDetails.query.expiresAt) < new Date()
                            ? 'bg-rose-100 text-rose-600'
                            : 'bg-yellow-100 text-yellow-600'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          queryDetails.query.status === 'closed'
                            ? 'bg-emerald-600'
                            : new Date(queryDetails.query.expiresAt) < new Date()
                              ? 'bg-rose-600 animate-pulse'
                              : 'bg-yellow-600'
                        }`} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">SLA Response Window</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-450 mt-0.5">
                          {queryDetails.query.status === 'closed'
                            ? 'Resolved within the target response SLA window.'
                            : new Date(queryDetails.query.expiresAt) < new Date()
                              ? 'SLA breached. Admins and senior responders have been notified to expedite this query.'
                              : 'Active SLA: Responders target query claim and resolution window.'}
                        </p>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-1 block">
                          {queryDetails.query.status === 'closed'
                            ? 'SLA Fulfilled'
                            : `Deadline: ${formatDate(queryDetails.query.expiresAt)}`}
                        </span>
                      </div>
                    </div>

                    {/* Step 3: Assignment */}
                    <div className="relative">
                      {/* Circle Indicator */}
                      <div className={`absolute -left-[41px] top-0.5 w-6 h-6 rounded-full border-4 border-white dark:border-[#22211e] flex items-center justify-center ${
                        queryDetails.query.assignedTo
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-900'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          queryDetails.query.assignedTo
                            ? 'bg-emerald-600'
                            : 'bg-slate-400 dark:bg-slate-600'
                        }`} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Responder Claim</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-450 mt-0.5">
                          {queryDetails.query.assignedTo
                            ? `Claimed by active responder: ${queryDetails.query.assignedTo.name}`
                            : 'Awaiting claim by a verified responder or bot.'}
                        </p>
                        {queryDetails.query.assignedTo && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-1 block">
                            Claimed at {formatDate(queryDetails.query.claimedAt)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Step 4: Answer Submitted */}
                    <div className="relative">
                      {/* Circle Indicator */}
                      <div className={`absolute -left-[41px] top-0.5 w-6 h-6 rounded-full border-4 border-white dark:border-[#22211e] flex items-center justify-center ${
                        queryDetails.answers && queryDetails.answers.length > 0
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-900'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          queryDetails.answers && queryDetails.answers.length > 0
                            ? 'bg-emerald-600'
                            : 'bg-slate-400 dark:bg-slate-600'
                        }`} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Answer Submission</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-450 mt-0.5">
                          {queryDetails.answers && queryDetails.answers.length > 0
                            ? `Received ${queryDetails.answers.length} answer(s) from the community.`
                            : 'Awaiting first response from responders.'}
                        </p>
                        {queryDetails.answers && queryDetails.answers.length > 0 && (
                          <div className="mt-3 space-y-2 select-text max-w-lg">
                            {queryDetails.answers.map(ans => (
                              <div key={ans._id} className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-800/80 text-xs flex justify-between items-start gap-3">
                                <div>
                                  <span className="font-bold text-slate-700 dark:text-slate-300">
                                    {ans.userId?.name || 'RAG Assistant'}
                                  </span>
                                  <p className="text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">{ans.content}</p>
                                </div>
                                <span className="text-[9px] text-slate-400 shrink-0">{formatDate(ans.createdAt)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Step 5: Resolution */}
                    <div className="relative">
                      {/* Circle Indicator */}
                      <div className={`absolute -left-[41px] top-0.5 w-6 h-6 rounded-full border-4 border-white dark:border-[#22211e] flex items-center justify-center ${
                        queryDetails.query.status === 'closed'
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-900'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          queryDetails.query.status === 'closed'
                            ? 'bg-emerald-600'
                            : 'bg-slate-400 dark:bg-slate-600'
                        }`} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Query Resolution</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-450 mt-0.5">
                          {queryDetails.query.status === 'closed'
                            ? 'Resolved. The best answer has been accepted, closing the query.'
                            : 'Your query remains open. Mark an answer as accepted once you verify it resolves your issue.'}
                        </p>
                        {queryDetails.query.status === 'closed' && (
                          <span className="text-[10px] text-slate-450 dark:text-slate-500 font-semibold mt-1 block">
                            Resolved • {formatDate(queryDetails.query.answeredAt)}
                          </span>
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-[#22211e] border border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center text-slate-400 dark:text-slate-500 select-none">
              <span className="text-4xl">🔍</span>
              <p className="mt-3 text-sm">Select a query from the sidebar to inspect its tracking timeline.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
