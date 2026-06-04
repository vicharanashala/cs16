import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);
import { useNavigate, Link } from 'react-router-dom';
import {
  getAnalytics,
  getQueryStats,
  getQueries,
  deleteQuery,
  closeQuery,
  getUsers,
  updateUserBan,
  bulkUserAction,
  getFAQRequests,
  resolveFAQRequest,
  rejectFAQRequest,
  deleteFAQ,
  getAdminFaqs,
  patchFaq,
  pinFaq,
  getAdminPins,
  createPin,
  updatePin,
  deletePin,
  getAuditLogs
} from '../services/api';
import { useToast } from '../components/ToastProvider';
import { useTheme } from '../context/ThemeContext';

const TABS = ['Overview', 'Queries', 'Users', 'FAQ Requests', 'Manage FAQs', 'Pins'];
const PAGE_SIZE = 10;

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { dark } = useTheme();
  const [activeTab, setActiveTab] = useState('Overview');
  const [stats, setStats] = useState(null);
  const [queries, setQueries] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [auditLogsError, setAuditLogsError] = useState(null);
  const [queryPage, setQueryPage] = useState(1);
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [users, setUsers] = useState([]);
  const [userPage, setUserPage] = useState(1);
  const [loadingUser, setLoadingUser] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [userStatus, setUserStatus] = useState({});
  // ── Bulk selection state ──────────────────────────────────────────────────
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [faqRequests, setFaqRequests] = useState([]);
  const [faqPage, setFaqPage] = useState(1);
  const [faqLoading, setFaqLoading] = useState(false);
  const [editingFaq, setEditingFaq] = useState(null);
  const [faqFilter, setFaqFilter] = useState('all');
  const [faqSearch, setFaqSearch] = useState('');
  const [faqManagePage, setFaqManagePage] = useState(1);      // pagination for Manage FAQs tab
  const [faqManageTotalPages, setFaqManageTotalPages] = useState(1);
  const [faqSearchInput, setFaqSearchInput] = useState('');   // debounced input
  const [adminFaqs, setAdminFaqs] = useState([]);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingFaqRequestId, setRejectingFaqRequestId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);
  // Pins tab state
  const [pins, setPins] = useState([]);
  const [pinsLoading, setPinsLoading] = useState(false);
  const [showPinForm, setShowPinForm] = useState(false);
  const [editingPin, setEditingPin] = useState(null);
  const [pinType, setPinType] = useState('announcement');
  const [pinTitle, setPinTitle] = useState('');
  const [pinContent, setPinContent] = useState('');
  const [pinFaqId, setPinFaqId] = useState('');
  const [pinOrder, setPinOrder] = useState(0);

  useEffect(() => {
    loadStats();
    loadQueries();
    loadUsers();
  }, []);

  useEffect(() => {
    if (activeTab === 'Overview') loadStats();
    if (activeTab === 'Queries') loadQueries();
    if (activeTab === 'Users') loadUsers();
    if (activeTab === 'FAQ Requests') loadFAQRequests();
    if (activeTab === 'Pins') loadAdminPins();
  }, [activeTab]);

  // ── Manage FAQs: single effect with all dependencies ──────────────────────
  // Consolidates tab-switch, filter change, page change, and debounced search
  // into one effect so the current values of ALL state are always in scope.
  useEffect(() => {
    if (activeTab === 'Manage FAQs') loadAdminFaqs(faqManagePage, faqFilter, faqSearch);
  }, [activeTab, faqManagePage, faqFilter, faqSearch]);

  // Debounce search input — wait 500ms after typing stops then update faqSearch
  // faqSearch change triggers the effect above with the latest page reset to 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setFaqManagePage(1);   // reset page first
      setFaqSearch(faqSearchInput);
    }, 500);
    return () => clearTimeout(timer);
  }, [faqSearchInput]);

  async function loadStats() {
    setLoadingStats(true);
    setLoadingAuditLogs(true);
    setAuditLogsError(null);
    try {
      const [analyticsRes, queryRes, auditLogsRes] = await Promise.all([
        getAnalytics(),
        getQueryStats(),
        getAuditLogs()
      ]);
      const data = analyticsRes.data;
      setStats({
        totalUsers: data.totals?.totalUsers ?? 0,
        totalFaqs: data.totals?.totalFAQs ?? 0,
        totalAnswers: data.totals?.totalAnswers ?? 0,
        totalQueries: data.totals?.totalQueries ?? 0,
        monthly: data.monthly,
        growth: data.growth,
        openQueries: data.openQueries ?? 0,
        slaBreachRate: data.slaBreachRate ?? 0,
        slaBreachedQueries: data.slaBreachedQueries ?? 0,
        popularTags: data.popularTags ?? [],
        topContributors: data.topContributors ?? [],
        dailyStats: data.dailyStats ?? [],
        queryStats: queryRes.data
      });
      // API returns { logs: [...] } — extract the array
      setAuditLogs(auditLogsRes.data || []);
    } catch (err) {
      showToast('Failed to load stats', 'error');
      setAuditLogsError('Failed to load recent activity log.');
    } finally {
      setLoadingStats(false);
      setLoadingAuditLogs(false);
    }
  }

  async function loadQueries() {
    setLoadingQueries(true);
    try {
      const res = await getQueries({ page: queryPage, pageSize: PAGE_SIZE });
      setQueries(res.data.queries || []);
    } catch (err) {
      showToast('Failed to load queries', 'error');
    } finally {
      setLoadingQueries(false);
    }
  }

  async function loadUsers() {
    setLoadingUser(true);
    try {
      const res = await getUsers({ page: userPage, pageSize: PAGE_SIZE });
      setUsers(res.data.users || []);
    } catch (err) {
      showToast('Failed to load users', 'error');
    } finally {
      setLoadingUser(false);
    }
  }

  async function loadFAQRequests() {
    setFaqLoading(true);
    try {
      const res = await getFAQRequests({ page: faqPage });
      setFaqRequests(res.data?.requests || res.data || []);
    } catch (err) {
      showToast('Failed to load FAQ requests', 'error');
    } finally {
      setFaqLoading(false);
    }
  }

  // Accept explicit params so callers always pass fresh values — avoids stale closure bug
  async function loadAdminFaqs(page = faqManagePage, filter = faqFilter, search = faqSearch) {
    setFaqLoading(true);
    try {
      const params = {
        page,
        limit: PAGE_SIZE,
      };
      if (filter !== 'all') params.status = filter;
      if (search.trim()) params.search = search.trim();

      const res = await getAdminFaqs(params);
      setAdminFaqs(res.data.faqs || res.data || []);
      if (res.data.pagination) {
        setFaqManageTotalPages(res.data.pagination.pages || 1);
      }
    } catch (err) {
      showToast('Failed to load FAQs', 'error');
    } finally {
      setFaqLoading(false);
    }
  }

  async function loadAdminPins() {
    setPinsLoading(true);
    try {
      const res = await getAdminPins();
      setPins(res.data || []);
    } catch (err) {
      showToast('Failed to load pins', 'error');
    } finally {
      setPinsLoading(false);
    }
  }

  async function handleCreatePin(e) {
    e.preventDefault();
    if (!pinTitle.trim()) return;

    if (pinType === 'faq') {
      if (!pinFaqId || !pinFaqId.trim()) {
        showToast('FAQ ID is required for pins of type FAQ', 'error');
        return;
      }
      if (!/^[0-9a-fA-F]{24}$/.test(pinFaqId.trim())) {
        showToast('Please enter a valid 24-character MongoDB ObjectId for the FAQ ID', 'error');
        return;
      }
    }

    try {
      if (editingPin) {
        await updatePin(editingPin._id, {
          title: pinTitle,
          content: pinType !== 'faq' ? pinContent : null,
          faqId: pinType === 'faq' ? pinFaqId.trim() : null,
          order: Number(pinOrder),
          type: pinType
        });
        showToast('Pin updated', 'success');
      } else {
        await createPin({
          type: pinType,
          title: pinTitle,
          content: pinType !== 'faq' ? pinContent : null,
          faqId: pinType === 'faq' ? pinFaqId.trim() : null,
          order: Number(pinOrder)
        });
        showToast('Pin created', 'success');
      }
      setShowPinForm(false);
      setEditingPin(null);
      setPinTitle('');
      setPinContent('');
      setPinFaqId('');
      setPinOrder(0);
      loadAdminPins();
    } catch (err) {
      showToast(editingPin ? 'Failed to update pin' : 'Failed to create pin', 'error');
    }
  }

  async function handleDeletePin(id) {
    if (!confirm('Remove this pin?')) return;
    try {
      await deletePin(id);
      showToast('Pin removed', 'success');
      loadAdminPins();
    } catch (err) {
      showToast('Failed to remove pin', 'error');
    }
  }

  function openEditPin(pin) {
    setEditingPin(pin);
    setPinType(pin.type || 'announcement');
    setPinTitle(pin.title || '');
    setPinContent(pin.content || '');
    setPinFaqId(pin.faqId?._id || '');
    setPinOrder(pin.order || 0);
    setShowPinForm(true);
  }

  function closePinForm() {
    setShowPinForm(false);
    setEditingPin(null);
    setPinTitle('');
    setPinContent('');
    setPinFaqId('');
    setPinOrder(0);
    setPinType('announcement');
  }

  async function handleClose(queryId) {
    try {
      await closeQuery(queryId);
      showToast('Query closed', 'success');
      loadQueries();
    } catch (err) {
      showToast('Failed to close query', 'error');
    }
  }

  async function handleDeleteQuery(queryId) {
    if (!window.confirm('Delete this query permanently?')) return;
    try {
      await deleteQuery(queryId);
      showToast('Query deleted', 'success');
      loadQueries();
    } catch (err) {
      showToast('Failed to delete query', 'error');
    }
  }

  async function handleResolve(faqReqId) {
    try {
      await resolveFAQRequest(faqReqId);
      showToast('FAQ request resolved', 'success');
      loadFAQRequests();
    } catch (err) {
      showToast('Failed to resolve FAQ request', 'error');
    }
  }

  function openRejectModal(faqReqId) {
    setRejectingFaqRequestId(faqReqId);
    setRejectionReason('');
    setShowRejectModal(true);
  }

  function closeRejectModal() {
    setShowRejectModal(false);
    setRejectingFaqRequestId(null);
    setRejectionReason('');
  }

  async function handleConfirmRejectFAQ() {
    if (!rejectionReason.trim()) {
      showToast('Please provide a rejection reason', 'error');
      return;
    }

    setRejectLoading(true);
    try {
      await rejectFAQRequest(rejectingFaqRequestId, { rejectionReason: rejectionReason.trim() });
      showToast('FAQ request rejected', 'success');
      loadFAQRequests();
      closeRejectModal();
    } catch (err) {
      showToast('Failed to reject FAQ request', 'error');
    } finally {
      setRejectLoading(false);
    }
  }

  async function handleToggleBan(userId, currentStatus) {
    const isCurrentlyBanned = currentStatus === 'banned';
    const action = isCurrentlyBanned ? 'unban' : 'ban';
    try {
      setUserStatus(prev => ({ ...prev, [userId]: 'loading' }));
      await updateUserBan(userId, !isCurrentlyBanned);
      // Optimistically update UI — no page reload needed
      setUsers(prev => prev.map(u =>
        u._id === userId ? { ...u, status: isCurrentlyBanned ? 'active' : 'banned' } : u
      ));
      showToast(`User ${action}ned successfully`, 'success');
    } catch (err) {
      showToast('Failed to update user', 'error');
    } finally {
      setUserStatus(prev => ({ ...prev, [userId]: null }));
    }
  }

  // ── Bulk selection helpers ─────────────────────────────────────────────────
  function toggleSelectUser(userId) {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedUserIds.size === users.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(users.map(u => u._id)));
    }
  }

  async function handleBulkAction(action) {
    if (selectedUserIds.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await bulkUserAction([...selectedUserIds], action);
      // Optimistically update UI for all selected users — no reload needed
      setUsers(prev => prev.map(u => {
        if (!selectedUserIds.has(u._id)) return u;
        if (action === 'ban') return { ...u, status: 'banned' };
        if (action === 'unban') return { ...u, status: 'active' };
        if (action === 'promote') return { ...u, role: 'admin' };
        return u;
      }));
      setSelectedUserIds(new Set());
      showToast(res.data.message, 'success');
    } catch (err) {
      showToast(`Failed to ${action} selected users`, 'error');
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleTogglePin(faqId, currentlyPinned) {
    try {
      await pinFaq(faqId);
      showToast(currentlyPinned ? 'FAQ unpinned' : 'FAQ pinned', 'success');
      loadAdminFaqs();
    } catch (err) {
      showToast('Failed to update pin status', 'error');
    }
  }

  async function handleSoftDeleteRestore(faqId, currentDeleted) {
    try {
      await patchFaq(faqId, { deletedAt: currentDeleted ? null : new Date() });
      showToast(currentDeleted ? 'FAQ restored' : 'FAQ soft-deleted', 'success');
      loadAdminFaqs();
    } catch (err) {
      showToast('Failed to update FAQ', 'error');
    }
  }

  async function handleEditSave(faqId, newAnswer) {
    try {
      await patchFaq(faqId, { finalAnswer: newAnswer });
      showToast('FAQ updated', 'success');
      setEditingFaq(null);
      loadAdminFaqs();
    } catch (err) {
      showToast('Failed to update FAQ', 'error');
    }
  }

  // Filter and search FAQs
  const filteredFaqs = adminFaqs.filter(faq => {
    const matchesSearch = faqSearch
      ? faq.title?.toLowerCase().includes(faqSearch.toLowerCase())
      : true;
    const matchesFilter = faqFilter === 'all'
      ? true
      : faqFilter === 'duplicate'
        ? faq.status === 'duplicate'
        : faq.status === faqFilter;
    return matchesSearch && matchesFilter;
  });

  // ── Admin theme tokens (dynamic based on global light/dark theme) ──────────
  const adminTheme = dark ? {
    bg: '#191816',        // deepest surface
    elevated: '#22211e',  // card/panel surface
    elevated2: '#2c2a26', // row hover / input bg
    border: '#3e3b36',    // all borders
    gold: '#dca54c',      // gold accent
    text: '#e6e4df',      // primary text
    muted: '#b5b2aa',     // secondary text
    faint: '#85827b',     // placeholder / tertiary
  } : {
    bg: '#f9f6f0',        // light paper background
    elevated: '#fbfaf7',  // white panel surface
    elevated2: '#eeeae2', // light hover / input bg
    border: '#e6dfd3',    // light borders
    gold: '#b37719',      // premium amber/gold accent
    text: '#191919',      // primary dark text
    muted: '#69635b',     // secondary dark text
    faint: '#857d73',     // placeholder
  };

  return (
    <div style={{ background: adminTheme.bg, minHeight: '100vh', color: adminTheme.text }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-12 gap-8 items-start">
          {/* Main Content Area */}
          <div className="col-span-12 lg:col-span-9 order-2 lg:order-1 space-y-6">

        {/* Overview */}
        {activeTab === 'Overview' && (stats || loadingAuditLogs || auditLogsError) && (
          <OverviewPanel
            stats={stats}
            loading={loadingStats}
            auditLogs={auditLogs}
            loadingAuditLogs={loadingAuditLogs}
            auditLogsError={auditLogsError}
            onRetry={loadStats}
          />
        )}

        {/* Queries */}
        {activeTab === 'Queries' && (
          <div>
            <h2 style={{ color: adminTheme.gold }} className="text-lg font-semibold mb-4">Community Queries</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${adminTheme.border}` }}>
                    <th style={{ color: adminTheme.muted }} className="pb-3 font-medium text-left">Query</th>
                    <th style={{ color: adminTheme.muted }} className="pb-3 font-medium text-left">Status</th>
                    <th style={{ color: adminTheme.muted }} className="pb-3 font-medium text-left">Claims</th>
                    <th style={{ color: adminTheme.muted }} className="pb-3 font-medium text-left">Answers</th>
                    <th style={{ color: adminTheme.muted }} className="pb-3 font-medium text-left">SLA</th>
                    <th style={{ color: adminTheme.muted }} className="pb-3 font-medium text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queries.map(q => (
                    <tr key={q._id} style={{ borderBottom: `1px solid ${adminTheme.border}` }}>
                      <td style={{ color: adminTheme.text }} className="py-3 max-w-xs truncate">{q.title}</td>
                      <td className="py-3">
                        <span className={`badge badge-${q.status === 'open' ? 'green' : q.status === 'claimed' ? 'yellow' : 'red'}`}>
                          {q.status}
                        </span>
                      </td>
                      <td style={{ color: adminTheme.muted }} className="py-3">{q.claims?.length || 0}</td>
                      <td style={{ color: adminTheme.muted }} className="py-3">{q.answerCount || 0}</td>
                      <td style={{ color: adminTheme.muted }} className="py-3">
                        {q.expiresAt ? new Date(q.expiresAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 flex gap-2">
                        <button onClick={() => navigate(`/community?highlight=${q._id}`)} style={{ color: adminTheme.gold }} className="hover:underline text-xs">View</button>
                        <button onClick={() => handleClose(q._id)} className="text-red-400 hover:underline text-xs">Close</button>
                        <button onClick={() => handleDeleteQuery(q._id)} className="text-red-400 hover:underline text-xs">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button onClick={() => { setQueryPage(p => Math.max(1, p - 1)); loadQueries(); }} disabled={queryPage === 1} style={{ background: adminTheme.elevated, color: adminTheme.text, border: `1px solid ${adminTheme.border}` }} className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-40">Previous</button>
              <span style={{ color: adminTheme.muted }} className="text-sm">Page {queryPage}</span>
              <button onClick={() => { setQueryPage(p => p + 1); loadQueries(); }} disabled={queries.length < PAGE_SIZE} style={{ background: adminTheme.elevated, color: adminTheme.text, border: `1px solid ${adminTheme.border}` }} className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-40">Next</button>
            </div>
          </div>
        )}

        {/* Users */}
        {activeTab === 'Users' && (
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Users</h2>

            {/* ── Sticky Bulk Toolbar ── */}
            {selectedUserIds.size > 0 && (
              <div className="sticky top-0 z-10 flex items-center gap-3 bg-primary-50 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-800 rounded-xl px-4 py-3 mb-4 shadow-sm">
                <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">
                  {selectedUserIds.size} user{selectedUserIds.size !== 1 ? 's' : ''} selected
                </span>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={() => handleBulkAction('ban')}
                    disabled={bulkLoading}
                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-40 transition-colors"
                  >
                    🚫 Ban Selected
                  </button>
                  <button
                    onClick={() => handleBulkAction('unban')}
                    disabled={bulkLoading}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-40 transition-colors"
                  >
                    ✅ Unban Selected
                  </button>
                  <button
                    onClick={() => handleBulkAction('promote')}
                    disabled={bulkLoading}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold disabled:opacity-40 transition-colors"
                  >
                    ⭐ Promote to Admin
                  </button>
                  <button
                    onClick={() => setSelectedUserIds(new Set())}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                    {/* Select-all checkbox */}
                    <th className="pb-3 pr-3 w-8">
                      <input
                        type="checkbox"
                        checked={users.length > 0 && selectedUserIds.size === users.length}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 dark:border-slate-600 accent-primary-600 cursor-pointer"
                        title="Select all"
                      />
                    </th>
                    <th className="pb-3 text-slate-500 font-medium">Name</th>
                    <th className="pb-3 text-slate-500 font-medium">Email</th>
                    <th className="pb-3 text-slate-500 font-medium">Role</th>
                    <th className="pb-3 text-slate-500 font-medium">Reputation</th>
                    <th className="pb-3 text-slate-500 font-medium">Status</th>
                    <th className="pb-3 text-slate-500 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr
                      key={u._id}
                      className={`border-b border-slate-100 dark:border-slate-800 transition-colors ${selectedUserIds.has(u._id) ? 'bg-primary-50/50 dark:bg-primary-950/20' : ''
                        }`}
                    >
                      {/* Per-row checkbox */}
                      <td className="py-3 pr-3">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.has(u._id)}
                          onChange={() => toggleSelectUser(u._id)}
                          className="rounded border-slate-300 dark:border-slate-600 accent-primary-600 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 text-slate-800 dark:text-slate-200">{u.name}</td>
                      <td className="py-3 text-slate-600 dark:text-slate-400">{u.email}</td>
                      <td className="py-3">
                        <span className={`badge ${u.role === 'admin' ? 'badge-red' : 'badge-blue'}`}>{u.role}</span>
                      </td>
                      <td className="py-3 text-slate-600 dark:text-slate-400">{(u.reputation || 0).toLocaleString()}</td>
                      <td className="py-3">
                        {u.status === 'banned'
                          ? <span className="badge badge-red">Banned</span>
                          : <span className="badge badge-green">Active</span>}
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => handleToggleBan(u._id, u.status)}
                          disabled={userStatus[u._id] === 'loading'}
                          className="text-xs text-red-600 hover:underline disabled:opacity-40"
                        >
                          {u.status === 'banned' ? 'Unban' : 'Ban'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button onClick={() => { setUserPage(p => Math.max(1, p - 1)); loadUsers(); }} disabled={userPage === 1} className="btn-secondary text-sm disabled:opacity-40">Previous</button>
              <span className="text-sm text-slate-500">Page {userPage}</span>
              <button onClick={() => { setUserPage(p => p + 1); loadUsers(); }} disabled={users.length < PAGE_SIZE} className="btn-secondary text-sm disabled:opacity-40">Next</button>
            </div>
          </div>
        )}

        {/* FAQ Requests */}
        {activeTab === 'FAQ Requests' && (
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">FAQ Requests</h2>
            {faqLoading ? (
              <p className="text-slate-500">Loading...</p>
            ) : faqRequests.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400">No pending FAQ requests.</p>
            ) : (
              <div className="space-y-4">
                {faqRequests.map(req => (
                  <div key={req._id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <div className="mb-2">
                      <span className={`badge ${req.status === 'pending' ? 'badge-yellow' : req.status === 'approved' ? 'badge-green' : 'badge-red'}`}>
                        {req.status}
                      </span>
                      {req.submittedBy && (
                        <span className="text-xs text-slate-400 ml-2">by {req.submittedBy.name || 'unknown'}</span>
                      )}
                      {req.queryId && (
                        <span className="text-xs text-slate-400 ml-2">on: {typeof req.queryId === 'object' ? req.queryId.title : req.queryId}</span>
                      )}
                    </div>
                    <p className="font-medium text-slate-900 dark:text-slate-100 mb-1">Q: {req.proposedQuestion}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-3 line-clamp-3">A: {req.proposedAnswer}</p>
                    {req.proposedTags && req.proposedTags.length > 0 && (
                      <p className="text-xs text-slate-400 mb-2">Tags: {req.proposedTags.join(', ')}</p>
                    )}
                    {req.status === 'pending' && (
                      <div className="flex gap-2">
                        <button onClick={() => handleResolve(req._id)} className="btn-primary text-sm">Approve</button>
                        <button onClick={() => openRejectModal(req._id)} className="btn-secondary text-sm">Reject</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showRejectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
            <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Reject FAQ Request</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Provide a short reason to help the volunteer understand why this request was rejected.</p>
                </div>
                <button
                  onClick={closeRejectModal}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Close reject modal"
                >
                  ×
                </button>
              </div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2" htmlFor="rejectionReason">
                Rejection reason
              </label>
              <textarea
                id="rejectionReason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={5}
                className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 p-3 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Example: Duplicate of FAQ #10"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeRejectModal}
                  className="btn-secondary text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRejectFAQ}
                  disabled={rejectLoading}
                  className="btn-primary text-sm"
                >
                  {rejectLoading ? 'Rejecting…' : 'Reject request'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Manage FAQs */}
        {activeTab === 'Manage FAQs' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Manage FAQs</h2>
              <div className="flex items-center gap-3">
                {/* Search — debounced via faqSearchInput state */}
                <input
                  type="text"
                  placeholder="Search FAQs..."
                  value={faqSearchInput}
                  onChange={e => setFaqSearchInput(e.target.value)}
                  className="input py-1.5 text-sm w-48"
                />
                {/* Filter — resets to page 1 */}
                <select
                  value={faqFilter}
                  onChange={e => {
                    const newFilter = e.target.value;
                    setFaqFilter(newFilter);
                    setFaqManagePage(1);
                    loadAdminFaqs(1, newFilter, faqSearch); // pass fresh values directly
                  }}
                  className="input py-1.5 text-sm"
                >
                  <option value="all">All FAQs</option>
                  <option value="resolved">Resolved</option>
                  <option value="duplicate">Duplicate</option>
                </select>
                {/* Refresh */}
                <button onClick={() => loadAdminFaqs(1, faqFilter, faqSearch)} className="btn-secondary text-sm">Refresh</button>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: 'Total FAQs', value: adminFaqs.length },
                { label: 'Resolved', value: adminFaqs.filter(f => f.status === 'resolved').length },
                { label: 'Soft-deleted', value: adminFaqs.filter(f => f.deletedAt).length },
              ].map(s => (
                <div key={s.label} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{s.value}</p>
                  <p className="text-sm text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Table */}
            {faqLoading ? (
              <p className="text-slate-500">Loading...</p>
            ) : adminFaqs.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400">No FAQs found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                      <th className="pb-3 text-slate-500 font-medium">Title</th>
                      <th className="pb-3 text-slate-500 font-medium">Status</th>
                      <th className="pb-3 text-slate-500 font-medium">Tags</th>
                      <th className="pb-3 text-slate-500 font-medium">Upvotes</th>
                      <th className="pb-3 text-slate-500 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminFaqs.map(faq => (
                      <tr key={faq._id} className={`border-b border-slate-100 dark:border-slate-800 ${faq.deletedAt ? 'opacity-60' : ''}`}>
                        <td className="py-3 text-slate-800 dark:text-slate-200 max-w-xs truncate">{faq.title}</td>
                        <td className="py-3">
                          <span className={`badge ${faq.deletedAt ? 'badge-red' : faq.status === 'resolved' ? 'badge-green' : 'badge-yellow'}`}>
                            {faq.deletedAt ? 'Deleted' : faq.status}
                          </span>
                          {faq.pinned && <span className="badge badge-amber ml-1">pinned</span>}
                        </td>
                        <td className="py-3 text-slate-600 dark:text-slate-400">
                          {(faq.tags || []).slice(0, 3).join(', ')}
                        </td>
                        <td className="py-3 text-slate-600 dark:text-slate-400">{faq.upvotes || 0}</td>
                        <td className="py-3 flex gap-2 flex-wrap">
                          <button
                            onClick={() => setEditingFaq({ _id: faq._id, title: faq.title, finalAnswer: faq.finalAnswer || '' })}
                            className="text-primary-600 hover:underline text-xs whitespace-nowrap"
                          >
                            Edit Answer
                          </button>
                          <button
                            onClick={() => handleSoftDeleteRestore(faq._id, !!faq.deletedAt)}
                            className="text-xs hover:underline whitespace-nowrap"
                          >
                            {faq.deletedAt ? 'Restore' : 'Soft-Delete'}
                          </button>
                          <button
                            onClick={() => handleTogglePin(faq._id, !!faq.pinned)}
                            className={`text-xs hover:underline whitespace-nowrap ${faq.pinned ? 'text-amber-600' : ''}`}
                          >
                            {faq.pinned ? 'Unpin' : 'Pin'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination controls */}
            {faqManageTotalPages > 1 && (
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={() => setFaqManagePage(p => Math.max(1, p - 1))}
                  disabled={faqManagePage === 1}
                  className="btn-secondary text-sm disabled:opacity-40"
                >Previous</button>
                <span className="text-sm text-slate-500">Page {faqManagePage} of {faqManageTotalPages}</span>
                <button
                  onClick={() => setFaqManagePage(p => Math.min(faqManageTotalPages, p + 1))}
                  disabled={faqManagePage === faqManageTotalPages}
                  className="btn-secondary text-sm disabled:opacity-40"
                >Next</button>
              </div>
            )}
          </div>
        )}

        {/* Pins */}
        {activeTab === 'Pins' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-850 pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-serif">Pins Administration</h2>
                <p className="text-xs text-slate-500 mt-1">Manage announcements, platform overviews, and persistent homepage FAQ spotlights.</p>
              </div>
              <button
                onClick={() => {
                  closePinForm();
                  setShowPinForm(true);
                }}
                className="btn-primary text-sm flex items-center gap-1.5 shadow-sm"
              >
                <span>+</span> New Pin
              </button>
            </div>

            {pinsLoading ? (
              <div className="flex justify-center py-12">
                <div className="spinner" />
              </div>
            ) : pins.length === 0 ? (
              <div className="text-center py-16 bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                <span className="text-3xl">📌</span>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-3 font-medium">No pins active on the platform feed.</p>
                <p className="text-xs text-slate-400 mt-1">Create an announcement, overview, or FAQ pin to pin content to the top.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pins.map(pin => (
                  <div
                    key={pin._id}
                    className="card flex flex-col justify-between border border-slate-200/60 dark:border-slate-800/80 bg-white/70 dark:bg-[#1f1e1b]/40 backdrop-blur-sm shadow-sm hover:border-primary-400/50 dark:hover:border-primary-500/40 transition-all duration-300"
                  >
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`badge uppercase tracking-wider text-[9px] px-2.5 py-0.5 font-bold ${pin.type === 'faq' ? 'badge-blue' :
                            pin.type === 'announcement' ? 'badge-yellow' :
                              'badge-green'
                          }`}>
                          {pin.type}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-555 flex items-center gap-1 uppercase select-none">
                          Order Index: <span className="text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-850 px-1.5 py-0.5 rounded">{pin.order}</span>
                        </span>
                      </div>

                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100 text-base leading-snug font-serif">{pin.title}</p>
                        {pin.type !== 'faq' && pin.content && (
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed line-clamp-3 whitespace-pre-wrap font-sans">
                            {pin.content}
                          </p>
                        )}
                        {pin.type === 'faq' && pin.faqId && (
                          <div className="mt-2.5 p-2.5 rounded-lg bg-primary-50/20 dark:bg-primary-950/5 border border-primary-100/30 dark:border-primary-900/10">
                            <p className="text-[10px] font-bold text-primary-500 uppercase tracking-wider mb-1">Spotlight FAQ Link</p>
                            <p className="text-xs font-semibold text-slate-755 dark:text-slate-300 truncate">
                              {pin.faqId.title || "Untitled FAQ"}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate">ID: {pin.faqId._id || pin.faqId}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/60 mt-4 pt-3 select-none">
                      <div className="text-[10px] text-slate-405 flex items-center gap-1.5">
                        <span>👤 Pinned by</span>
                        <span className="font-semibold text-slate-600 dark:text-slate-350">{pin.pinnedBy?.name || 'Admin'}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openEditPin(pin)}
                          className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-350 text-xs font-bold transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeletePin(pin._id)}
                          className="text-red-500 hover:text-red-650 text-xs font-bold transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Create/Edit Pin Modal */}
            {showPinForm && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-2xl shadow-2xl w-full max-w-md animate-zoom-in">
                  <div className="px-6 py-4.5 border-b border-slate-200 dark:border-slate-800/85 flex items-center justify-between">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-serif">
                      {editingPin ? '✏️ Modify Active Pin' : '📌 Create Spotlight Pin'}
                    </h3>
                    <button onClick={closePinForm} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-250 transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <form onSubmit={handleCreatePin} className="p-6 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Pin Type</label>
                      <select
                        value={pinType}
                        onChange={e => setPinType(e.target.value)}
                        className="input w-full py-2.5 text-sm"
                      >
                        <option value="announcement">Announcement Card</option>
                        <option value="overview">Platform Overview Text</option>
                        <option value="faq">Spotlight FAQ Document</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Title</label>
                      <input
                        type="text"
                        value={pinTitle}
                        onChange={e => setPinTitle(e.target.value)}
                        className="input w-full py-2.5 text-sm"
                        placeholder="e.g. Phase 2 Registration Deadline"
                        required
                      />
                    </div>

                    {pinType !== 'faq' ? (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Content Body</label>
                        <textarea
                          value={pinContent}
                          onChange={e => setPinContent(e.target.value)}
                          className="input w-full font-sans py-2 text-sm leading-relaxed"
                          rows={4}
                          placeholder="Write announcement body or platform description details here..."
                          required
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 flex items-center justify-between">
                          <span>FAQ Linked ID</span>
                          <span className="text-[10px] text-slate-400 normal-case font-normal">(24-char Mongoose ObjectId)</span>
                        </label>
                        <input
                          type="text"
                          value={pinFaqId}
                          onChange={e => setPinFaqId(e.target.value)}
                          className="input w-full py-2.5 text-sm font-mono"
                          placeholder="e.g. 66567634f19b22204c00010c"
                          required
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Display Order Index</label>
                      <input
                        type="number"
                        value={pinOrder}
                        onChange={e => setPinOrder(e.target.value)}
                        className="input w-full py-2.5 text-sm"
                        placeholder="0"
                        min="0"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Lower order numbers appear first. Default is 0.</p>
                    </div>

                    <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/60 mt-5">
                      <button type="button" onClick={closePinForm} className="btn-outline px-4 py-2">Cancel</button>
                      <button type="submit" className="btn-primary px-5 py-2">
                        {editingPin ? 'Save Changes' : 'Publish Pin'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
          </div>

          {/* Right Navigation Panel */}
          <div className="col-span-12 lg:col-span-3 order-1 lg:order-2 lg:sticky lg:top-20 space-y-4">
            <div style={{ background: adminTheme.elevated, border: `1px solid ${adminTheme.border}` }} className="rounded-2xl p-4 shadow-md space-y-3">
              <div className="border-b pb-2 select-none" style={{ borderBottomColor: adminTheme.border }}>
                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: adminTheme.gold }}>Control Station</h3>
                <p className="text-[10px] mt-0.5" style={{ color: adminTheme.muted }}>Manage Grantha Platform</p>
              </div>
              <nav className="flex flex-row lg:flex-col flex-wrap gap-1 w-full">
                {TABS.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      color: activeTab === tab ? adminTheme.gold : adminTheme.muted,
                      background: activeTab === tab ? adminTheme.elevated2 : 'transparent',
                    }}
                    className={`px-4 py-2.5 text-xs md:text-sm font-semibold tracking-wide hover:opacity-85 transition-all text-left flex-1 lg:flex-none rounded-lg lg:rounded-l-none lg:rounded-r-lg border-b-2 lg:border-b-0 lg:border-l-[3px] focus:outline-none ${
                      activeTab === tab
                        ? 'border-[#dca54c]'
                        : 'border-transparent'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </nav>
            </div>

            <div style={{ background: adminTheme.elevated, border: `1px solid ${adminTheme.border}` }} className="rounded-2xl p-4 shadow-md space-y-3">
              <div className="border-b pb-2 select-none" style={{ borderBottomColor: adminTheme.border }}>
                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: adminTheme.gold }}>Public Platform</h3>
                <p className="text-[10px] mt-0.5" style={{ color: adminTheme.muted }}>Go to user-facing pages</p>
              </div>
              <nav className="flex flex-row lg:flex-col flex-wrap gap-1 w-full">
                {[
                  { to: '/', label: 'FAQs' },
                  { to: '/wiki', label: 'Wiki' },
                  { to: '/community', label: 'Community' },
                  { to: '/leaderboard', label: 'Leaderboard' }
                ].map(link => (
                  <Link
                    key={link.to}
                    to={link.to}
                    style={{
                      color: adminTheme.muted,
                    }}
                    className="px-4 py-2.5 text-xs md:text-sm font-semibold tracking-wide hover:opacity-85 hover:bg-[#252320] transition-all text-left flex-1 lg:flex-none rounded-lg lg:rounded-l-none lg:rounded-r-lg border-b-2 lg:border-b-0 lg:border-l-[3px] border-transparent focus:outline-none"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </div>

        {/* Edit FAQ Modal */}
        {editingFaq && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Edit FAQ Answer</h3>
                <p className="text-sm text-slate-500 truncate max-w-xs">{editingFaq.title}</p>
              </div>
              <div className="p-6">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-350 mb-2">Answer</label>
                <textarea
                  rows={8}
                  className="input w-full font-mono text-sm"
                  value={editingFaq.finalAnswer}
                  onChange={e => setEditingFaq(f => ({ ...f, finalAnswer: e.target.value }))}
                />
              </div>
              <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
                <button onClick={() => setEditingFaq(null)} className="btn-secondary">Cancel</button>
                <button
                  onClick={() => handleEditSave(editingFaq._id, editingFaq.finalAnswer)}
                  className="btn-primary"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewPanel({ stats, loading, auditLogs, loadingAuditLogs, auditLogsError, onRetry }) {
  const { dark } = useTheme();
  const adminTheme = dark ? {
    bg: '#191816',
    elevated: '#22211e',
    elevated2: '#2c2a26',
    border: '#3e3b36',
    gold: '#dca54c',
    text: '#e6e4df',
    muted: '#b5b2aa',
    faint: '#85827b',
  } : {
    bg: '#f9f6f0',
    elevated: '#fbfaf7',
    elevated2: '#eeeae2',
    border: '#e6dfd3',
    gold: '#b37719',
    text: '#191919',
    muted: '#69635b',
    faint: '#857d73',
  };

  const dailyStats = stats?.dailyStats || [];
  const chartData = {
    labels: dailyStats.slice(-7).map(s => s.date),
    datasets: [{
      label: 'Queries',
      data: dailyStats.slice(-7).map(s => s.queries),
      borderColor: adminTheme.gold,
      backgroundColor: 'rgba(220,165,76,0.12)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointBackgroundColor: adminTheme.gold
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: adminTheme.muted }
      },
      y: {
        beginAtZero: true,
        grid: { color: `${adminTheme.border}80` },
        ticks: { color: adminTheme.muted }
      }
    }
  };

  // Helper for human-readable relative timestamps
  function getRelativeTime(timestamp) {
    if (!timestamp) return '';
    const secondsAgo = Math.floor((Date.now() - new Date(timestamp)) / 1000);
    if (secondsAgo < 60) return 'just now';
    const minutesAgo = Math.floor(secondsAgo / 60);
    if (minutesAgo < 60) return `${minutesAgo} minute${minutesAgo === 1 ? '' : 's'} ago`;
    const hoursAgo = Math.floor(minutesAgo / 60);
    if (hoursAgo < 24) return `${hoursAgo} hour${hoursAgo === 1 ? '' : 's'} ago`;
    const daysAgo = Math.floor(hoursAgo / 24);
    if (daysAgo === 1) return 'Yesterday';
    if (daysAgo < 7) return `${daysAgo} days ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div className="space-y-6 w-full animate-fade-in">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Users', value: stats?.totalUsers ?? 0 },
          { label: 'Total FAQs', value: stats?.totalFaqs ?? 0 },
          { label: 'Open Queries', value: stats?.queryStats?.open ?? 0 },
          { label: 'SLA Breach Rate', value: stats?.slaBreachRate != null ? `${stats.slaBreachRate.toFixed(1)}%` : '0%' },
        ].map(s => (
          <div key={s.label} style={{ background: adminTheme.elevated, border: `1px solid ${adminTheme.border}` }} className="rounded-xl p-5 shadow-sm">
            <p className="text-3xl font-bold" style={{ color: adminTheme.text }}>{s.value}</p>
            <p className="text-sm mt-1 font-medium" style={{ color: adminTheme.muted }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Query Volume Chart */}
      <div style={{ background: adminTheme.elevated, border: `1px solid ${adminTheme.border}` }} className="rounded-xl p-5 min-h-[320px]">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <p className="text-sm font-semibold" style={{ color: adminTheme.muted }}>Query volume</p>
            <h3 className="text-xl font-semibold" style={{ color: adminTheme.text }}>Last 7 days</h3>
          </div>
          <span className="text-xs uppercase tracking-[0.2em]" style={{ color: adminTheme.faint }}>
            {dailyStats.length ? `${dailyStats.length} days tracked` : 'No data'}
          </span>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="inline-flex items-center gap-2" style={{ color: adminTheme.muted }}>
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                <path d="M22 12a10 10 0 0 1-10 10" strokeLinecap="round" />
              </svg>
              Loading chart...
            </div>
          </div>
        ) : dailyStats.length === 0 ? (
          <div className="flex h-64 items-center justify-center" style={{ color: adminTheme.muted }}>No query data available yet.</div>
        ) : (
          <div className="h-[320px]">
            <Line data={chartData} options={chartOptions} />
          </div>
        )}
      </div>

      {/* Audit Logs Chronological Timeline */}
      <div style={{ background: adminTheme.elevated, border: `1px solid ${adminTheme.border}` }} className="rounded-xl p-6 shadow-md flex flex-col">
        <div className="border-b pb-3 mb-4 flex items-center justify-between" style={{ borderBottomColor: adminTheme.border }}>
          <div>
            <h3 className="text-md font-semibold font-serif uppercase tracking-wider" style={{ color: adminTheme.gold }}>
              Recent Moderator Activity
            </h3>
            <p className="text-xs mt-1" style={{ color: adminTheme.muted }}>
              Recent administrative events and moderation logs recorded on the platform.
            </p>
          </div>
          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: adminTheme.border, color: adminTheme.gold }}>
            Live Feed
          </span>
        </div>

        {/* Scrollable container with fixed height */}
        <div className="overflow-y-auto max-h-[350px] pr-2 space-y-4 font-sans scrollbar-thin">
          {loadingAuditLogs ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <div
                className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: `${adminTheme.gold} transparent ${adminTheme.gold} transparent` }}
              />
              <p className="text-sm font-medium" style={{ color: adminTheme.muted }}>Loading activities...</p>
            </div>
          ) : auditLogsError ? (
            <div className="text-center py-12 px-4 border border-dashed rounded-xl" style={{ borderColor: adminTheme.border }}>
              <span className="text-2xl">⚠️</span>
              <p className="text-sm mt-2 font-medium text-red-400">{auditLogsError}</p>
              <button
                onClick={onRetry}
                style={{ background: adminTheme.elevated2, border: `1px solid ${adminTheme.border}`, color: adminTheme.gold }}
                className="mt-4 px-4 py-2 rounded-lg text-xs font-semibold hover:opacity-90 active:scale-95 transition-all"
              >
                Retry Loading
              </button>
            </div>
          ) : (!auditLogs || auditLogs.length === 0) ? (
            <div className="text-center py-16">
              <span className="text-2xl">📜</span>
              <p className="text-sm mt-2 font-medium" style={{ color: adminTheme.muted }}>No activity logged yet.</p>
            </div>
          ) : (
            <div className="relative border-l pl-4 ml-2 space-y-5" style={{ borderLeftColor: adminTheme.border }}>
              {auditLogs.map((log) => {
                let color = adminTheme.gold;
                let dotIcon = '●';
                if (log.action.includes('delete') || log.action === 'deleted pin') {
                  color = '#ef4444';
                  dotIcon = '✕';
                } else if (log.action.includes('restore')) {
                  color = '#10b981';
                  dotIcon = '↺';
                } else if (log.action === 'resolved SLA breach') {
                  color = '#f59e0b';
                  dotIcon = '⚡';
                } else if (log.action === 'created pin') {
                  color = '#3b82f6';
                  dotIcon = '📌';
                }

                const rawName = log.performedBy?.name || 'Admin';
                // Normalise: prepend "Admin" if the name doesn't already start with it
                const displayName = rawName.toLowerCase().startsWith('admin') ? rawName : `Admin ${rawName}`;

                let actionText = '';
                if (log.action === 'soft-deleted') {
                  actionText = `soft-deleted ${log.targetModel} "${log.targetName || 'Untitled'}"`;
                } else if (log.action === 'restored') {
                  actionText = `restored ${log.targetModel} "${log.targetName || 'Untitled'}"`;
                } else if (log.action === 'resolved SLA breach') {
                  actionText = `resolved SLA breach for Query "${log.targetName || 'Untitled'}"`;
                } else if (log.action === 'created pin') {
                  actionText = `created Pin "${log.targetName || 'Untitled'}"`;
                } else if (log.action === 'updated pin') {
                  actionText = `updated Pin "${log.targetName || 'Untitled'}"`;
                } else if (log.action === 'deleted pin') {
                  actionText = `deleted Pin "${log.targetName || 'Untitled'}"`;
                } else {
                  actionText = `${log.action} ${log.targetModel} "${log.targetName || 'Untitled'}"`;
                }

                return (
                  <div key={log._id} className="relative group">
                    <div
                      className="absolute -left-[25px] top-1 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm select-none"
                      style={{ background: adminTheme.elevated2, border: `1px solid ${adminTheme.border}`, color }}
                    >
                      {dotIcon}
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1 pl-1">
                      <div>
                        <span className="font-semibold text-sm mr-1.5" style={{ color: adminTheme.text }}>
                          {displayName}
                        </span>
                        <span className="text-sm font-medium" style={{ color: adminTheme.muted }}>
                          {actionText}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold shrink-0" style={{ color: adminTheme.faint }}>
                        {getRelativeTime(log.timestamp)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
