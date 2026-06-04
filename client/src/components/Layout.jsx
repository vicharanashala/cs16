import { useState, useEffect } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { getPins, getNotifications, markNotificationRead, markAllNotificationsRead } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getInitials, getAvatarColor } from '../utils/avatar';

export default function Layout() {
  const location = useLocation();
  const [pins, setPins] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();

  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [showAnalyticsTooltip, setShowAnalyticsTooltip] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getPins().then(res => setPins(res.data || [])).catch(() => {});
  }, []);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    const handleVolunteerSuccess = () => {
      setShowAnalyticsTooltip(true);
      const timer = setTimeout(() => {
        setShowAnalyticsTooltip(false);
      }, 8000);
      return () => clearTimeout(timer);
    };

    window.addEventListener('volunteer-success', handleVolunteerSuccess);
    return () => window.removeEventListener('volunteer-success', handleVolunteerSuccess);
  }, []);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    const fetchNotifications = async () => {
      try {
        const res = await getNotifications();
        setNotifications(res.data || []);
      } catch (err) {
        // Silently fail
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    setNotificationsOpen(false);
  }, [location.pathname]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleNotificationClick = async (notif) => {
    setNotificationsOpen(false);
    if (!notif.isRead) {
      try {
        await markNotificationRead(notif._id);
        setNotifications(prev => prev.map(n => n._id === notif._id ? { ...n, isRead: true } : n));
      } catch (err) {
        console.error('Failed to mark notification read:', err);
      }
    }
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const navLinks = [
    { to: '/', label: 'FAQs' },
    { to: '/wiki', label: 'Wiki' },
    { to: '/community', label: 'Community' },
    ...(user ? [{ to: '/leaderboard', label: 'Leaderboard' }] : []),
  ];

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  // Hide footer on FAQ/Wiki/Community — Samagama link lives in the RAG widget there
  const hideFooter = ['/', '/wiki', '/community'].includes(location.pathname);
  const isLeaderboard = location.pathname === '/leaderboard';
  const isAdmin = location.pathname.startsWith('/admin');


  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#191816]">
      {/* ── Navbar ── */}
      <header className="sticky top-0 z-30 shadow-sm bg-white dark:bg-[#22211e] border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">G</span>
              </div>
              <span className="font-semibold text-base hidden sm:block text-slate-900 dark:text-slate-100">Grantha</span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden sm:flex items-center gap-1">
              {!isAdmin && navLinks.map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive(link.to)
                      ? 'bg-primary-50 dark:bg-primary-950/20 text-primary-700 dark:text-primary-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-2">
            {/* Theme toggle */}
              <button
                onClick={toggle}
                className="p-2 rounded-lg transition-colors text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
                title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {dark ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l.707.707M6.343 17.657l.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>

              {/* User controls */}
              {user ? (
                <>
                  {user.role !== 'admin' && (
                    <Link
                      to="/ask"
                      className="hidden sm:flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="Raise a Query"
                    >
                      <svg className="w-4 h-4 shrink-0 animate-bounce-slow" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v5" />
                        <path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v6" />
                        <path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8" />
                        <path d="M6 14V10a2 2 0 0 0-2-2 2 2 0 0 0-2 2v10a6 6 0 0 0 6 6h4a6 6 0 0 0 6-6V12a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
                      </svg>
                      <span className="font-medium">Raise Query</span>
                    </Link>
                  )}
                  {/* Notification Bell */}
                  <div className="relative mr-1.5 flex items-center">
                    <button
                      onClick={() => setNotificationsOpen(!notificationsOpen)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 relative transition-all duration-200"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white dark:ring-slate-900 animate-pulse" />
                      )}
                    </button>

                    {/* Dropdown panel */}
                    {notificationsOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setNotificationsOpen(false)} />
                        <div className="absolute right-0 top-full mt-2 w-80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl shadow-xl py-1.5 z-50 animate-fade-in origin-top-right transition-all">
                          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Notifications</span>
                            {unreadCount > 0 && (
                              <button
                                onClick={handleMarkAllRead}
                                className="text-[10px] text-primary-600 dark:text-primary-400 hover:underline font-semibold"
                              >
                                Mark all as read
                              </button>
                            )}
                          </div>

                          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                            {notifications.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                                <svg className="w-6 h-6 text-slate-300 dark:text-slate-600 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                                <p className="text-[11px] text-slate-400">All caught up! No notifications yet.</p>
                              </div>
                            ) : (
                              notifications.map(notif => (
                                <button
                                  key={notif._id}
                                  onClick={() => handleNotificationClick(notif)}
                                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 flex gap-2.5 items-start transition-colors ${
                                    !notif.isRead ? 'bg-slate-50/60 dark:bg-slate-800/20 font-medium' : ''
                                  }`}
                                >
                                  <div className="w-1.5 h-1.5 bg-primary-500 rounded-full mt-1.5 shrink-0" style={{ opacity: notif.isRead ? 0 : 1 }} />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{notif.title}</p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug line-clamp-2">{notif.message}</p>
                                    <span className="text-[9px] text-slate-400 mt-1 block">
                                      {new Date(notif.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="relative group">
                    <button
                       className={`w-8 h-8 ${getAvatarColor(user.name)} text-white rounded-full text-sm font-semibold flex items-center justify-center`}
                      >
                        {getInitials(user.name)}
                    </button>
                    
                    
                    {/* Analytics Tooltip pointing directly up at avatar */}
                    {showAnalyticsTooltip && (
                      <div className="absolute right-0 top-full mt-2 w-60 bg-amber-500 text-white rounded-xl shadow-xl p-3 z-50 animate-bounce-slow flex flex-col gap-1 border border-amber-400">
                        <div className="absolute right-3.5 -top-1 w-3 h-3 bg-amber-500 transform rotate-45 border-l border-t border-amber-400" />
                        <div className="flex items-start justify-between gap-1.5">
                          <p className="text-[11px] font-bold leading-normal flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            Responder status active! Analytics added.
                          </p>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setShowAnalyticsTooltip(false); }}
                            className="text-white/80 hover:text-white transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Dropdown */}
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                      <div className="px-3 py-2 border-b border-slate-100">
                        <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
                        <p className="text-xs text-slate-500 truncate">{user.email}</p>
                      </div>
                      {user.role !== 'admin' && (
                        <Link to="/profile" className="block px-3 py-2 text-sm text-slate-655 hover:bg-slate-50 hover:text-primary-600">
                          My Profile
                        </Link>
                      )}
                      {user.role !== 'admin' && (
                        <Link to="/track-query" className="block px-3 py-2 text-sm text-slate-650 hover:bg-slate-50 hover:text-primary-600">
                          Track Query
                        </Link>
                      )}
                      {user.isVolunteer && (
                        <Link to="/stats" className="block px-3 py-2 text-sm text-slate-650 hover:bg-slate-50 hover:text-primary-600">
                          Board Statistics
                        </Link>
                      )}
                      {user.role === 'admin' && (
                        <Link to="/admin" className="block px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-primary-600">
                          Admin Dashboard
                        </Link>
                      )}
                      <button
                        onClick={logout}
                        className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        Sign out
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <Link to="/login" className="text-sm text-slate-600 hover:text-primary-600 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                    Sign in
                  </Link>
                  <Link to="/register" className="btn-primary text-sm py-1.5 px-3">
                    Register
                  </Link>
                </>
              )}

              {/* Mobile menu button */}
              <button
                className="sm:hidden p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                onClick={() => setMenuOpen(m => !m)}
              >
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {menuOpen
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  }
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="sm:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1">
            {!isAdmin && navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className={`block px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive(link.to)
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {user && user.role !== 'admin' && (
              <Link to="/ask" className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950/30 rounded-lg">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v5" />
                  <path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v6" />
                  <path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8" />
                  <path d="M6 14V10a2 2 0 0 0-2-2 2 2 0 0 0-2 2v10a6 6 0 0 0 6 6h4a6 6 0 0 0 6-6V12a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
                </svg>
                Raise Query
              </Link>
            )}
          </div>
        )}
      </header>

      {/* ── Page content — rendered via React Router's <Outlet /> ── */}
      {/* pb-24 on RAG-bar pages so fixed launcher never covers last content */}
      <main className={`flex-1 ${hideFooter ? 'pb-24' : ''}`}>
        <Outlet />
      </main>

      {/* ── Footer — hidden on FAQ/Wiki/Community and Admin ── */}
      {!hideFooter && !isAdmin && (
        <footer className="bg-white border-t border-slate-200 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-primary-600 rounded flex items-center justify-center">
                  <span className="text-white text-xs font-bold">G</span>
                </div>
                <span>Grantha</span>
              </div>
              <div className="flex items-center gap-4">
                {isLeaderboard && (
                  <a
                    href="https://www.samagama.in/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary-600 transition-colors"
                  >
                    samagama.in
                  </a>
                )}
                <Link to="/" className="hover:text-primary-600 transition-colors">FAQs</Link>
                <Link to="/community" className="hover:text-primary-600 transition-colors">Community</Link>
                {user && <Link to="/leaderboard" className="hover:text-primary-600 transition-colors">Leaderboard</Link>}
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
