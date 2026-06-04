import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getLeaderboard, getCategories, getCategoryContributors } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getVolunteerLevel } from '../utils/gamificationHelper';

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('alltime'); 
  const [searchQuery, setSearchQuery] = useState('');

  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('global');
  const [categoryContributors, setCategoryContributors] = useState([]);
  const [loadingCategory, setLoadingCategory] = useState(false);

  // 👇 Re-trigger fetch whenever the timeframe tab changes
  useEffect(() => {
    setLoading(true);
    getLeaderboard({ limit: 100, timeframe })
      .then(res => setUsers(res.data || []))
      .catch(err => console.error('Failed to load leaderboard:', err))
      .finally(() => setLoading(false));
  }, [timeframe]);

  useEffect(() => {
    getCategories()
      .then(res => setCategories(res.data || []))
      .catch(err => console.error('Failed to load categories:', err));
  }, []);

  useEffect(() => {
    if (activeCategory === 'global') {
      setCategoryContributors([]);
      return;
    }
    setLoadingCategory(true);
    getCategoryContributors(activeCategory)
      .then(res => setCategoryContributors(res.data || []))
      .catch(err => console.error('Failed to load category contributors:', err))
      .finally(() => setLoadingCategory(false));
  }, [activeCategory]);

  // Real-time client-side filter — preserves original rank numbers
  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u => u.name?.toLowerCase().includes(q));
  }, [users, searchQuery]);

  const isFiltering = searchQuery.trim().length > 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-slate-900 dark:text-slate-100 mb-2">Leaderboard</h1>
          <p className="text-slate-600 dark:text-slate-400">Top contributors ranked by reputation</p>
        </div>
        
        {/* 👇 3. Toggle Control Buttons Box Added */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl select-none w-fit self-start sm:self-center">
          <button
            onClick={() => setTimeframe('weekly')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              timeframe === 'weekly'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Weekly Rank
          </button>
          <button
            onClick={() => setTimeframe('alltime')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              timeframe === 'alltime'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            All Time
          </button>
        </div>

        {!user && (
          <Link to="/login" className="btn-primary text-sm shadow-sm hover:shadow-md transition-all shrink-0">
            Sign in to compete
          </Link>
        )}
      </div>

      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 md:col-span-3 space-y-4">
          <div className="bg-white dark:bg-[#22211e] border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm">
            <h3 className="text-[10px] font-bold text-slate-455 dark:text-slate-500 uppercase tracking-wider mb-2.5 select-none">
              Filter by Category
            </h3>
            <div className="space-y-1 max-h-[360px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
              <button
                onClick={() => { setActiveCategory('global'); setSearchQuery(''); }}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-155 flex items-center justify-between ${
                  activeCategory === 'global'
                    ? 'bg-primary-50 dark:bg-primary-950/20 text-primary-600 dark:text-primary-400 border border-primary-200/40 dark:border-primary-900/10'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/40 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                  Global Standings
                </span>
                <span className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full font-bold">
                  {users.length}
                </span>
              </button>

              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => { setActiveCategory(cat.tag); setSearchQuery(''); }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-155 flex items-center justify-between ${
                    activeCategory === cat.tag
                      ? 'bg-primary-50 dark:bg-primary-950/20 text-primary-600 dark:text-primary-400 border border-primary-200/40 dark:border-primary-900/10'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/40 border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <svg className="w-3.5 h-3.5 shrink-0 text-slate-455" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="truncate">{cat.name}</span>
                  </span>
                  <span className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full font-bold shrink-0">
                    {cat.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-12 md:col-span-9 space-y-4">
          {activeCategory === 'global' ? (
            <>
              <div className="relative mb-4">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search global standings by name..."
                  className="input pl-9 pr-9 py-2 text-sm w-full bg-white dark:bg-[#22211e] focus:outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-655 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {loading ? (
                <div className="flex justify-center py-16"><div className="spinner" /></div>
              ) : filteredUsers.length === 0 ? (
                isFiltering ? (
                  <div className="text-center py-16 text-slate-455 dark:text-slate-500">
                    <p className="text-base font-semibold">No results for "{searchQuery}"</p>
                    <button onClick={() => setSearchQuery('')} className="mt-2 text-sm text-primary-600 hover:underline">Clear search</button>
                  </div>
                ) : (
                  <div className="text-center py-16 text-slate-400 dark:text-slate-555">No users found.</div>
                )
              ) : (
                <div className="space-y-4">
                  {!isFiltering && filteredUsers.length >= 3 && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                      <GlobalTopContributorCard userObj={filteredUsers[0]} rank={0} />
                      <GlobalTopContributorCard userObj={filteredUsers[1]} rank={1} />
                      <GlobalTopContributorCard userObj={filteredUsers[2]} rank={2} />
                    </div>
                  )}

                  <div className="space-y-3">
                    {filteredUsers.slice(isFiltering ? 0 : 3).map((u) => {
                      const globalRank = users.findIndex(x => x._id === u._id);
                      return (
                        <GlobalLeaderboardRow key={u._id} userObj={u} rank={globalRank} />
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {loadingCategory ? (
                <div className="flex justify-center py-16"><div className="spinner" /></div>
              ) : categoryContributors.length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-[#22211e] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 select-none">
                  <p className="text-base font-semibold text-slate-655 dark:text-slate-350">No answers recorded for this category yet</p>
                  <p className="text-xs text-slate-455 mt-1.5">Be the first to claim and answer a query tagged with this category!</p>
                  <Link to="/community" className="btn-primary mt-4 inline-block text-xs py-2">Browse Community</Link>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="border-b border-slate-105 dark:border-slate-800 pb-3 flex items-center justify-between select-none">
                    <h2 className="text-lg font-serif font-bold text-slate-850 dark:text-slate-200">
                      Top Category Responders
                    </h2>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500">
                      Ranked by activity score
                    </span>
                  </div>

                  <div className="space-y-3">
                    {categoryContributors.map((contrib, idx) => (
                      <CategoryContributorCard key={contrib._id} contributor={contrib} rank={idx} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="mt-8 bg-slate-550 dark:bg-slate-900/30 rounded-2xl p-5 text-sm text-slate-600 dark:text-slate-400 border border-slate-200/50 dark:border-slate-850 select-none">
            <p className="font-semibold text-slate-800 dark:text-slate-300 mb-3">How to earn reputation:</p>
            <ul className="space-y-2">
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Submit an answer that gets accepted — <strong className="text-slate-700 dark:text-slate-300">+10</strong>
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-primary-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                Your answer gets converted to a public FAQ — <strong className="text-slate-700 dark:text-slate-300">+10</strong>
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-505 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M2 20h2c.55 0 1-.45 1-1v-7c0-.55-.45-1-1-1H2v9zm19.83-7.12c.11-.25.17-.52.17-.8V11c0-1.1-.9-2-2-2h-5.5l.92-4.65c.05-.22.02-.46-.08-.66-.23-.45-.52-.86-.88-1.22L14 2 7.59 8.41C7.21 8.79 7 9.3 7 9.83V19c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05-.03.15z"/></svg>
                Your answer gets upvoted — <strong className="text-slate-700 dark:text-slate-300">+5</strong>
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-505 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M2 20h2c.55 0 1-.45 1-1v-7c0-.55-.45-1-1-1H2v9zm19.83-7.12c.11-.25.17-.52.17-.8V11c0-1.1-.9-2-2-2h-5.5l.92-4.65c.05-.22.02-.46-.08-.66-.23-.45-.52-.86-.88-1.22L14 2 7.59 8.41C7.21 8.79 7 9.3 7 9.83V19c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05-.03.15z"/></svg>
                Your question gets upvoted — <strong className="text-slate-700 dark:text-slate-300">+2</strong>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function GlobalLeaderboardRow({ userObj, rank }) {
  return (
    <div className="card flex items-center gap-4 bg-white dark:bg-[#22211e] border border-slate-200 dark:border-slate-800 p-4 rounded-2xl hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm transition-all duration-200">
      {/* Rank */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
        rank === 0 ? 'bg-amber-100 text-amber-700 border-2 border-amber-300 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30' :
        rank === 1 ? 'bg-slate-100 text-slate-600 border-2 border-slate-300 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/30' :
        rank === 2 ? 'bg-orange-100 text-orange-700 border-2 border-orange-300 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30' :
        'bg-slate-50 text-slate-400 border border-slate-200 dark:bg-[#191816] dark:border-slate-800 dark:text-slate-500'
      }`}>
        {rank + 1}
      </div>

      {/* User info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-850 dark:text-slate-200 truncate">{userObj.name}</span>
          {getVolunteerLevel(userObj) && (
            <span className={`px-2 py-px rounded-full text-[9px] font-bold border uppercase tracking-wider select-none shrink-0 ${getVolunteerLevel(userObj).badgeClass}`} title={`${getVolunteerLevel(userObj).name} (Level ${getVolunteerLevel(userObj).level})`}>
              {getVolunteerLevel(userObj).icon} Lvl {getVolunteerLevel(userObj).level}
            </span>
          )}
          {userObj.role === 'admin' && (
            <span className="badge badge-red text-xs shrink-0">Admin</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-slate-450 dark:text-slate-500 select-none">
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {userObj.questionsAsked || 0} asked
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            {userObj.answersGiven || 0} answered
          </span>
        </div>
      </div>

      {/* Reputation */}
      <div className="text-right shrink-0">
        <span className="text-xl font-bold text-primary-600 dark:text-primary-400">{userObj.reputation || 0}</span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500 block uppercase tracking-wider font-semibold select-none">rep</span>
      </div>
    </div>
  );
}

function GlobalTopContributorCard({ userObj, rank }) {
  const level = getVolunteerLevel(userObj);
  return (
    <div className={`relative overflow-hidden bg-white dark:bg-[#22211e] border rounded-2xl p-5 flex flex-col items-center text-center shadow-sm hover:shadow-md hover:border-slate-350 dark:hover:border-slate-700 transition-all duration-300 ${
      rank === 0 ? 'border-amber-300 dark:border-amber-500/30 ring-2 ring-amber-500/5 sm:-translate-y-1' :
      rank === 1 ? 'border-slate-300 dark:border-slate-800' :
      'border-orange-355 dark:border-orange-500/30'
    }`}>
      {/* Crown / Trophy element for 1st place */}
      {rank === 0 && (
        <div className="absolute top-2.5 right-2.5 text-lg select-none">👑</div>
      )}

      {/* Rank Badge */}
      <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-black mb-3 shrink-0 ${
        rank === 0 ? 'bg-amber-100 text-amber-700 border-2 border-amber-300 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30' :
        rank === 1 ? 'bg-slate-100 text-slate-600 border-2 border-slate-300 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/30' :
        'bg-orange-100 text-orange-700 border-2 border-orange-300 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30'
      }`}>
        {rank === 0 ? '1st' : rank === 1 ? '2nd' : '3rd'}
      </div>

      <div className="w-full min-w-0">
        <span className="block font-bold text-slate-850 dark:text-slate-205 truncate text-sm">{userObj.name}</span>
        {level && (
          <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wider ${level.badgeClass}`}>
            {level.icon} Lvl {level.level}
          </span>
        )}
      </div>

      {/* Reputation details */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 w-full">
        <span className="text-xl font-extrabold text-primary-600 dark:text-primary-400">{userObj.reputation || 0}</span>
        <span className="text-[9px] text-slate-400 dark:text-slate-550 block uppercase tracking-wider font-bold select-none">Reputation</span>
      </div>

      {/* Mini stats */}
      <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-455 dark:text-slate-500 select-none">
        <span>{userObj.questionsAsked || 0} asked</span>
        <span className="text-slate-300 dark:text-slate-750">•</span>
        <span>{userObj.answersGiven || 0} answered</span>
      </div>
    </div>
  );
}

function CategoryContributorCard({ contributor, rank }) {
  return (
    <div className="card flex items-center gap-4 bg-white dark:bg-[#22211e] border border-slate-200 dark:border-slate-800 p-4 rounded-2xl hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm transition-all duration-200 animate-fade-in">
      {/* Rank */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
        rank === 0 ? 'bg-amber-100 text-amber-700 border-2 border-amber-300 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30' :
        rank === 1 ? 'bg-slate-100 text-slate-605 border-2 border-slate-300 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/30' :
        rank === 2 ? 'bg-orange-100 text-orange-700 border-2 border-orange-300 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30' :
        'bg-slate-50 text-slate-400 border border-slate-200 dark:bg-[#191816] dark:border-slate-800 dark:text-slate-500'
      }`}>
        {rank + 1}
      </div>

      {/* User Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-850 dark:text-slate-200 truncate">{contributor.name}</span>
          {getVolunteerLevel(contributor) && (
            <span className={`px-2 py-px rounded-full text-[9px] font-bold border uppercase tracking-wider select-none shrink-0 ${getVolunteerLevel(contributor).badgeClass}`} title={`${getVolunteerLevel(contributor).name} (Level ${getVolunteerLevel(contributor).level})`}>
              {getVolunteerLevel(contributor).icon} Lvl {getVolunteerLevel(contributor).level}
            </span>
          )}
        </div>

        {/* Category Stats Row */}
        <div className="flex items-center gap-4 mt-2.5 text-xs text-slate-550 dark:text-slate-450 flex-wrap select-none bg-slate-50/50 dark:bg-[#191816]/30 px-3 py-1.5 rounded-xl border border-slate-100 dark:border-slate-850 w-fit">
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-slate-455" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            <strong>{contributor.answerCount || 0}</strong> answers
          </span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span className="flex items-center gap-1 text-emerald-605 dark:text-emerald-450 font-medium">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            <strong>{contributor.acceptedCount || 0}</strong> accepted
          </span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-450 font-medium">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M2 20h2c.55 0 1-.45 1-1v-7c0-.55-.45-1-1-1H2v9zm19.83-7.12c.11-.25.17-.52.17-.8V11c0-1.1-.9-2-2-2h-5.5l.92-4.65c.05-.22.02-.46-.08-.66-.23-.45-.52-.86-.88-1.22L14 2 7.59 8.41C7.21 8.79 7 9.3 7 9.83V19c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05-.03.15z"/></svg>
            <strong>{contributor.upvotesCount || 0}</strong> votes
          </span>
        </div>
      </div>

      {/* Category Score & Total Rep */}
      <div className="text-right shrink-0 flex flex-col justify-center select-none">
        <div>
          <span className="text-lg font-extrabold text-primary-600 dark:text-primary-400">{contributor.score || 0}</span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold block uppercase tracking-wider">score</span>
        </div>
        <div className="mt-1 border-t border-slate-100 dark:border-slate-800/80 pt-1.5">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{contributor.reputation || 0} Total Rep</span>
        </div>
      </div>
    </div>
  );
}