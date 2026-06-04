import { useState, useEffect } from 'react';
import { getCategories, getFAQs, getFAQsByCategory, upvoteFAQ, pinFaq, getPins, toggleBookmark, getCategoryContributors } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastProvider';
import CommunityBoard from '../components/CommunityBoard';

const PAGE_SIZE = 10;

function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;

  // Build a windowed list: always show first, last, current ±1, with '…' gaps
  const getPageItems = () => {
    const items = [];
    const delta = 0; // pages on each side of current

    const rangeStart = Math.max(2, page - delta);
    const rangeEnd = Math.min(totalPages - 1, page + delta);

    items.push(1);

    if (rangeStart > 2) items.push('start-ellipsis');

    for (let p = rangeStart; p <= rangeEnd; p++) items.push(p);

    if (rangeEnd < totalPages - 1) items.push('end-ellipsis');

    if (totalPages > 1) items.push(totalPages);

    return items;
  };

  const btnBase = 'min-w-[2rem] px-2.5 py-1.5 rounded-lg border text-sm transition-colors';

  return (
    <div className="flex items-center justify-center gap-1 py-6">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className={`${btnBase} border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800`}
      >
        ← Prev
      </button>

      {getPageItems().map((item, idx) =>
        item === 'start-ellipsis' || item === 'end-ellipsis' ? (
          <span key={item} className="px-1 text-slate-400 text-sm select-none">…</span>
        ) : (
          <button
            key={item}
            onClick={() => onPage(item)}
            className={`${btnBase} ${
              item === page
                ? 'bg-primary-100 border-primary-300 text-primary-700 dark:bg-primary-900/40 dark:border-primary-700 dark:text-primary-300 font-medium'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {item}
          </button>
        )
      )}

      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
        className={`${btnBase} border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800`}
      >
        Next →
      </button>
    </div>
  );
}

function FAQsPage() {
  const { user } = useAuth();

  const [categories, setCategories] = useState([]);
  const [recentCategories, setRecentCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryFAQs, setCategoryFAQs] = useState([]);
  const [faqPage, setFaqPage] = useState(1);
  const [faqTotal, setFaqTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [allFAQs, setAllFAQs] = useState([]);
  const [allPage, setAllPage] = useState(1);
  const [allTotal, setAllTotal] = useState(0);
  const [pinnedFAQs, setPinnedFAQs] = useState([]);
  const [overview, setOverview] = useState(null);
  const [categoryContributors, setCategoryContributors] = useState([]);
  const [categoryContributorsLoading, setCategoryContributorsLoading] = useState(false);
  const [sortBy, setSortBy] = useState('recent');

  // Load initial data
  useEffect(() => {
    loadCategories();
    loadPinnedFAQs();
    loadOverview();
  }, []);

  // When sortBy changes, reload whatever list is currently active
  useEffect(() => {
    if (searchResults !== null) {
      handleSearch(null, 1);
    } else if (selectedCategory) {
      loadCategoryFAQs(selectedCategory.tag, 1);
    } else {
      loadAllFAQs(1);
    }
  }, [sortBy]);

  const loadPinnedFAQs = async () => {
    try {
      const res = await getFAQs({ pinned: 'true', limit: 100 });
      setPinnedFAQs(res.data?.faqs || []);
    } catch (err) {
      console.error('Failed to load pinned FAQs:', err);
    }
  };

  const loadOverview = async () => {
    try {
      const res = await getPins();
      const ov = res.data?.find(p => p.type === 'overview');
      if (ov) setOverview(ov);
    } catch (err) {
      console.error('Failed to load overview:', err);
    }
  };

  // When category changes, load its FAQs
  useEffect(() => {
    if (selectedCategory) {
      loadCategoryFAQs(selectedCategory.tag);
    }
  }, [selectedCategory]);

  useEffect(() => {
    if (!selectedCategory) {
      setCategoryContributors([]);
      return;
    }

    const fetchContributors = async () => {
      setCategoryContributorsLoading(true);
      try {
        const res = await getCategoryContributors(selectedCategory.tag);
        setCategoryContributors(res.data || []);
      } catch (err) {
        console.error('Failed to load category contributors:', err);
      } finally {
        setCategoryContributorsLoading(false);
      }
    };

    fetchContributors();
  }, [selectedCategory]);

  const loadCategories = async () => {
    try {
      // 1. Fetch standard, unfiltered categories for the top bevels
      const res = await getCategories();
      const rawCategories = res.data || [];
      
      const ALLOWED_CATEGORIES = [
        { tag: 'about-the-internship', name: 'About the internship' },
        { tag: 'selection-offer-letter-and-cer', name: 'Selection offer letter and Certificate' },
        { tag: 'noc-no-objection-certificate', name: 'NOC Certificate' },
        { tag: 'timing-and-dates', name: 'Timing & Date' },
        { tag: 'work-mentorship-and-projects', name: 'Work Mentorship & Project' },
        { tag: 'certificate', name: 'Certificate' }
      ];

      const filtered = ALLOWED_CATEGORIES.map(allowed => {
        const matched = rawCategories.find(c => c.tag === allowed.tag);
        return {
          ...matched,
          tag: allowed.tag,
          name: allowed.name,
          _id: matched?._id || allowed.tag,
          id: matched?._id || allowed.tag,
          count: matched?.count || 0
        };
      }).filter(c => c.count > 0);

      setCategories(filtered);

      // 2. Fetch recent 7-day viewed categories exclusively for the "This Week" sidebar
      const resRecent = await getCategories({ recent: true });
      setRecentCategories(resRecent.data || []);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const loadAllFAQs = async (page = 1) => {
    try {
      setLoading(true);
      const res = await getFAQs({ page, limit: PAGE_SIZE, sort: sortBy });
      setAllFAQs(res.data?.faqs || res.data || []);
      setAllTotal(res.data?.pagination?.total || 0);
      setAllPage(page);
    } catch (err) {
      console.error('Failed to load all FAQs:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadCategoryFAQs = async (tag, page = 1) => {
    try {
      setLoading(true);
      const res = await getFAQsByCategory(tag, { page, limit: PAGE_SIZE, sort: sortBy });
      setCategoryFAQs(res.data.faqs);
      setFaqTotal(res.data.pagination?.total || 0);
      setFaqPage(page);
    } catch (err) {
      console.error('Failed to load category FAQs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e, page = 1) => {
    e?.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await getFAQs({ search: searchQuery, page, pageSize: PAGE_SIZE, sort: sortBy });
      setSearchResults(res.data.faqs);
      setSearchTotal(res.data.pagination?.total || 0);
      setSearchPage(page);
      setSelectedCategory(null);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  const handleUpvote = async (faqId) => {
    if (!user) return;
    try {
      const res = await upvoteFAQ(faqId);
      const { upvotes, hasUpvoted } = res.data;
      const updateFAQ = (faqs) => faqs.map(f => {
        if (f._id !== faqId) return f;
        const upvoters = hasUpvoted
          ? [...(f.upvoters || []), user._id]
          : (f.upvoters || []).filter(id => id !== user._id && id?.toString() !== user._id?.toString());
        return { ...f, upvotes, upvoters };
      });
      setCategoryFAQs(updateFAQ);
      setPinnedFAQs(updateFAQ);
      if (searchResults) setSearchResults(updateFAQ(searchResults));
      if (allFAQs) setAllFAQs(updateFAQ(allFAQs));
    } catch (err) {
      // silently fail
    }
  };

  const handlePin = async (faqId, currentlyPinned) => {
    if (!user || user.role !== 'admin') return;
    try {
      await pinFaq(faqId);
      const updateFAQ = (faqs) => faqs.map(f =>
        f._id === faqId ? { ...f, pinned: !currentlyPinned } : f
      );
      setCategoryFAQs(updateFAQ);
      if (searchResults) setSearchResults(updateFAQ(searchResults));
      if (allFAQs) setAllFAQs(updateFAQ(allFAQs));
      loadPinnedFAQs();
    } catch (err) {
      // silently fail
    }
  };

  const selectCategory = (cat) => {
    if (selectedCategory?.tag === cat.tag) {
      setSelectedCategory(null);
      setCategoryFAQs([]);
      loadAllFAQs(1);
    } else {
      setSelectedCategory(cat);
      setSearchResults(null);
      setSearchQuery('');
      loadCategoryFAQs(cat.tag, 1);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {/* Category pills — search lives in sidebar */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          <button
            onClick={() => { setSelectedCategory(null); setSearchResults(null); setSearchQuery(''); loadAllFAQs(1); }}
            className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
              !selectedCategory && !searchResults
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat._id || cat.tag}
              onClick={() => selectCategory(cat)}
              className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedCategory?.tag === cat.tag
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Mobile/Tablet Overview Banner (hidden on lg+) ── */}
      <div className="lg:hidden mb-5 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/30 rounded-xl px-4 py-3 flex gap-3 items-start select-none">
        <div className="w-6 h-6 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded flex items-center justify-center shrink-0 mt-0.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-1">Overview</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {overview?.content || 'Grantha is your student-driven community knowledge base. Search existing resolved FAQs first before raising new queries. Help peers by answering open queries in the forum!'}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] text-slate-400 dark:text-slate-500">
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              Self-serve platform
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Collaborative learning
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Verified student answers
            </span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex gap-6 xl:gap-10">
        {/* ── Left Sidebar: Platform Overview ── */}
        <aside className="w-56 shrink-0 hidden lg:block">
          <div className="sticky top-20 select-none">
            <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/30 rounded-xl px-4 py-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded flex items-center justify-center shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                  Overview
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
                {overview?.content || 'Grantha is your student-driven community knowledge base. Search existing resolved FAQs first before raising new queries. Help peers by answering open queries in the forum!'}
              </p>
              <div className="pt-2 border-t border-emerald-200/50 dark:border-emerald-900/30 text-[10px] text-slate-400 dark:text-slate-500 space-y-1.5">
                <div className="flex items-center gap-2">
                  <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                  <span>Self-serve platform</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <span>Collaborative learning</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span>Verified student answers</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Left/Center: Community Board + FAQs OR Search Results ── */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {searchResults === null ? (
            <>
              {!selectedCategory && <CommunityBoard />}

              {/* Pinned FAQs isolated section under Announcements */}
              {pinnedFAQs.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-3 select-none">
                    <div className="w-6 h-6 bg-amber-100 dark:bg-amber-950/40 rounded flex items-center justify-center text-amber-600 dark:text-amber-400">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="17" x2="12" y2="22"></line>
                        <path d="M5 17h14v-1.76a2 2 0 0 0-.44-1.24l-2.33-2.9A3 3 0 0 1 15.56 9.3V5a2 2 0 0 0-2-2h-3.12a2 2 0 0 0-2 2v4.3a3 3 0 0 1-.67 1.8l-2.33 2.9a2 2 0 0 0-.44 1.24Z"></path>
                      </svg>
                    </div>
                    <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                      Pinned FAQs
                    </h2>
                  </div>
                  <div className="space-y-3 bg-amber-50/20 dark:bg-amber-950/5 border border-amber-200/40 dark:border-amber-900/10 p-4 rounded-2xl">
                    {pinnedFAQs.map(faq => (
                      <FAQItem key={faq._id} faq={faq} onUpvote={handleUpvote} onPin={handlePin} user={user} />
                    ))}
                  </div>
                </div>
              )}

              {/* No category selected — show all FAQs */}
              {!selectedCategory && (
                <section>
                  <div className="flex items-center justify-between mb-4 border-b border-slate-200/50 dark:border-slate-800/50 pb-2 select-none">
                    <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-350 uppercase tracking-wide">
                      All FAQs
                    </h2>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Sort By:</span>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="bg-transparent text-xs font-semibold text-slate-650 dark:text-slate-300 focus:outline-none cursor-pointer border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 hover:border-slate-300 dark:hover:border-slate-700 transition-all bg-white dark:bg-slate-900"
                      >
                        <option value="recent">Recent</option>
                        <option value="popular">Upvotes</option>
                      </select>
                    </div>
                  </div>
                  {loading ? (
                    <div className="flex justify-center py-10"><div className="spinner" /></div>
                  ) : (
                    <div className="space-y-3">
                      {/* Unpinned FAQs */}
                      {allFAQs.filter(faq => !faq.pinned).map(faq => (
                        <FAQItem key={faq._id} faq={faq} onUpvote={handleUpvote} onPin={handlePin} user={user} />
                      ))}
                      {allFAQs.filter(faq => !faq.pinned).length === 0 && (
                        <p className="text-slate-400 text-sm py-8 text-center">No FAQs yet. Be the first to add one!</p>
                      )}
                    </div>
                  )}
                  {allTotal > PAGE_SIZE && (
                    <Pagination
                      page={allPage}
                      totalPages={Math.ceil(allTotal / PAGE_SIZE)}
                      onPage={(p) => loadAllFAQs(p)}
                    />
                  )}
                </section>
              )}

              {/* Category selected — show filtered FAQs */}
              {selectedCategory && (
                <section>
                  <div className="flex items-center justify-between mb-4 border-b border-slate-200/50 dark:border-slate-800/50 pb-2">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <span>{selectedCategory.name}</span>
                      <span className="font-normal text-slate-450 text-xs">({faqTotal} FAQs)</span>
                    </h2>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-medium select-none">Sort By:</span>
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value)}
                          className="bg-transparent text-xs font-semibold text-slate-655 dark:text-slate-300 focus:outline-none cursor-pointer border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 hover:border-slate-300 dark:hover:border-slate-700 transition-all bg-white dark:bg-slate-900"
                        >
                          <option value="recent">Recent</option>
                          <option value="popular">Upvotes</option>
                        </select>
                      </div>
                      <button onClick={() => setSelectedCategory(null)} className="text-xs font-bold text-slate-500 hover:text-slate-750 dark:hover:text-slate-250 select-none">
                        ✕ Clear
                      </button>
                    </div>
                  </div>
                  {loading ? (
                    <div className="flex justify-center py-10"><div className="spinner" /></div>
                  ) : (
                    <div className="space-y-3">
                      {/* Unpinned category FAQs */}
                      {categoryFAQs.filter(faq => !faq.pinned).map(faq => (
                        <FAQItem key={faq._id} faq={faq} onUpvote={handleUpvote} onPin={handlePin} user={user} />
                      ))}
                      {categoryFAQs.filter(faq => !faq.pinned).length === 0 && (
                        <p className="text-slate-400 text-sm py-8 text-center">No FAQs in this topic yet.</p>
                      )}
                    </div>
                  )}
                  {faqTotal > PAGE_SIZE && (
                    <Pagination
                      page={faqPage}
                      totalPages={Math.ceil(faqTotal / PAGE_SIZE)}
                      onPage={(p) => loadCategoryFAQs(selectedCategory.tag, p)}
                    />
                  )}
                </section>
              )}
            </>
          ) : (
            /* ── Search Results (replaces central content) ── */
            <section>
              <div className="flex items-center justify-between mb-4 border-b border-slate-200/50 dark:border-slate-800/50 pb-2">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>Search results for "{searchQuery}"</span>
                  <span className="font-normal text-slate-450 text-xs">({searchTotal} found)</span>
                </h2>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-medium select-none">Sort By:</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="bg-transparent text-xs font-semibold text-slate-655 dark:text-slate-300 focus:outline-none cursor-pointer border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 hover:border-slate-300 dark:hover:border-slate-700 transition-all bg-white dark:bg-slate-900"
                    >
                      <option value="recent">Recent</option>
                      <option value="popular">Upvotes</option>
                    </select>
                  </div>
                  <button onClick={clearSearch} className="text-xs font-bold text-slate-500 hover:text-slate-750 dark:hover:text-slate-250 select-none">✕ Clear</button>
                </div>
              </div>
              {searchLoading ? (
                <div className="flex justify-center py-10"><div className="spinner" /></div>
              ) : searchResults.length === 0 ? (
                <p className="text-slate-400 text-center py-8">No FAQs found matching your search.</p>
              ) : (
                <div className="space-y-3">
                  {searchResults.map(faq => (
                    <FAQItem key={faq._id} faq={faq} onUpvote={handleUpvote} onPin={handlePin} user={user} />
                  ))}
                </div>
              )}
              {searchTotal > PAGE_SIZE && (
                <Pagination
                  page={searchPage}
                  totalPages={Math.ceil(searchTotal / PAGE_SIZE)}
                  onPage={(p) => handleSearch(null, p)}
                />
              )}
            </section>
          )}
        </div>

        {/* ── Right: Categories sidebar with search ── */}
        <aside className="w-52 shrink-0 hidden xl:block">
          <div className="sticky top-6">
            {/* Search inside sidebar */}
            <form onSubmit={e => { e.preventDefault(); handleSearch(null, 1); }} className="mb-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                  <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  className="input pl-8 py-1.5 text-xs"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    if (!e.target.value) setSearchResults(null);
                  }}
                />
              </div>
            </form>

            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">This Week</h3>
            <div className="space-y-0.5">
              {recentCategories.map(cat => (
                <button
                  key={cat.id || cat._id || cat.tag}
                  onClick={() => selectCategory(cat)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                    selectedCategory?.tag === cat.tag
                      ? 'bg-primary-100 text-primary-700 font-semibold'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="truncate">{cat.name}</span>
                    <span className={`text-xs shrink-0 ${
                      selectedCategory?.tag === cat.tag ? 'text-primary-500' : 'text-slate-400'
                    }`}>
                      {cat.count}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {selectedCategory && (
              <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                  Top Contributors
                </h4>
                {categoryContributorsLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : categoryContributors.length === 0 ? (
                  <p className="text-slate-400 text-[11px] leading-relaxed">No contributors for this category yet.</p>
                ) : (
                  <div className="space-y-2">
                    {categoryContributors.map((contrib, idx) => (
                      <div key={contrib._id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-xs font-bold ${idx === 0 ? 'text-amber-500' : idx === 1 ? 'text-slate-400' : 'text-amber-700'}`}>
                            #{idx + 1}
                          </span>
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-350 truncate">
                            {contrib.name}
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold text-primary-600 dark:text-primary-400 shrink-0">
                          {contrib.reputation} rep
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// FAQ Item — used in lists
function FAQItem({ faq, onUpvote, onPin, user, compact = false }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { setBookmarks } = useAuth();
  const toast = useToast();

  const isBookmarked = user?.bookmarks?.includes(faq._id);

  const handleBookmarkToggle = async () => {
    if (!user) {
      toast.info('Please sign in to save FAQs.');
      return;
    }
    try {
      const res = await toggleBookmark(faq._id);
      setBookmarks(res.data.bookmarks);
      toast.success(isBookmarked ? 'Removed from saved FAQs' : 'Saved to bookmarks');
    } catch (err) {
      toast.error('Failed to update bookmark');
    }
  };

  return (
    <div
      className={`card group transition-all duration-200 cursor-pointer border-slate-100/75 hover:border-primary-300/80 dark:border-slate-800/80 dark:hover:border-primary-500/80 ${
        isExpanded ? 'ring-2 ring-primary-100 bg-slate-50/50 shadow-sm' : 'hover:shadow-sm'
      } ${compact ? 'py-3' : ''}`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex flex-col">
        {/* Header Question Row */}
        <div className="flex items-start justify-between gap-3">
          <p className={`font-semibold text-slate-900 dark:text-slate-100 ${compact ? 'text-sm' : ''} flex items-center gap-2`}>
            {faq.pinned && (
              <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/>
              </svg>
            )}
            {faq.title}
          </p>
          
          {/* Expand Indicator */}
          <div className="flex items-center shrink-0 self-start pt-1 text-slate-400 dark:text-slate-600">
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${
                isExpanded ? 'rotate-180 text-primary-500' : 'group-hover:text-slate-650 dark:group-hover:text-slate-400'
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        
        {/* Expanded Answer */}
        <div
          className={`transition-all duration-300 overflow-hidden ${
            isExpanded ? 'max-h-[1000px] mt-3' : 'max-h-0'
          }`}
        >
          <p className="text-sm text-slate-650 dark:text-slate-350 whitespace-pre-line leading-relaxed pb-1">
            {faq.finalAnswer}
          </p>
        </div>

        {/* Bottom Actions Row - Tags on Left, Horizontal Actions on Right */}
        <div className="flex items-center justify-between mt-3.5 pt-2.5 border-t border-slate-100/40 dark:border-slate-800/40" onClick={(e) => e.stopPropagation()}>
          {/* Tags */}
          <div className="flex flex-wrap gap-1">
            {faq.tags && faq.tags.slice(0, 3).map(tag => (
              <span
                key={tag}
                className="badge badge-gray text-[10px] md:text-xs"
              >
                #{tag}
              </span>
            ))}
          </div>

          {/* Horizontal Actions Toolbar */}
          <div className="flex items-center gap-4 text-slate-400 dark:text-slate-550 shrink-0 select-none">
            
            {/* Upvotes */}
            <div className="flex items-center gap-1">
              {user?.role === 'admin' ? (
                <div className="text-slate-300 dark:text-slate-600 flex items-center gap-1 select-none" title="Admins cannot upvote FAQs">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                  </svg>
                </div>
              ) : (
                (() => {
                  const hasUpvoted = user && (faq.upvoters || []).some(id => id?.toString() === user._id?.toString() || id === user._id);
                  return (
                    <button
                      onClick={() => onUpvote(faq._id)}
                      disabled={!user}
                      className={`transition-all duration-150 disabled:cursor-not-allowed ${
                        hasUpvoted
                          ? 'text-primary-600 dark:text-primary-400 scale-110'
                          : 'text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:scale-110'
                      }`}
                      title={user ? (hasUpvoted ? 'Remove upvote' : 'Upvote') : 'Sign in to upvote'}
                    >
                      {hasUpvoted ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M2 20h2c.55 0 1-.45 1-1v-7c0-.55-.45-1-1-1H2v9zm19.83-7.12c.11-.25.17-.52.17-.8V11c0-1.1-.9-2-2-2h-5.5l.92-4.65c.05-.22.02-.46-.08-.66-.23-.45-.52-.86-.88-1.22L14 2 7.59 8.41C7.21 8.79 7 9.3 7 9.83V19c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05-.03.15z"/>
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                        </svg>
                      )}
                    </button>
                  );
                })()
              )}
              <span className={`text-xs font-semibold ${
                user && (faq.upvoters || []).some(id => id?.toString() === user._id?.toString() || id === user._id)
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-slate-600 dark:text-slate-400'
              }`}>{faq.upvotes}</span>
            </div>

            {/* Bookmark */}
            {user?.role !== 'admin' && (
              <button
                onClick={handleBookmarkToggle}
                className={`hover:text-primary-600 transition-colors ${
                  isBookmarked ? 'text-primary-600' : 'text-slate-350 dark:text-slate-500'
                }`}
                title={user ? (isBookmarked ? 'Remove bookmark' : 'Bookmark FAQ') : 'Sign in to bookmark'}
              >
                <svg
                  className="w-4 h-4"
                  fill={isBookmarked ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
                  />
                </svg>
              </button>
            )}

            {/* Share */}
            <button
              type="button"
              onClick={async (e) => {
                const url = `${window.location.origin}/wiki?highlight=${faq._id}`;
                try {
                  await navigator.clipboard.writeText(url);
                  toast.success('📋 Share link copied to clipboard!');
                } catch (err) {
                  toast.error('Failed to copy link');
                }
              }}
              className="hover:text-primary-600 text-slate-350 dark:text-slate-500 transition-colors"
              title="Share FAQ"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 10.742l5.474-3.285M8.684 13.258l5.474 3.285M19 6.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm0 11a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM7 12a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
            </button>

            {/* Admin Pin */}
            {user?.role === 'admin' && (
              <button
                onClick={() => onPin(faq._id, !!faq.pinned)}
                className={`hover:text-amber-500 transition-colors ${faq.pinned ? 'text-amber-500' : ''}`}
                title={faq.pinned ? 'Unpin FAQ' : 'Pin FAQ'}
              >
                <svg className="w-4 h-4" fill={faq.pinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="17" x2="12" y2="22"></line>
                  <path d="M5 17h14v-1.76a2 2 0 0 0-.44-1.24l-2.33-2.9A3 3 0 0 1 15.56 9.3V5a2 2 0 0 0-2-2h-3.12a2 2 0 0 0-2 2v4.3a3 3 0 0 1-.67 1.8l-2.33 2.9a2 2 0 0 0-.44 1.24Z"></path>
                </svg>
              </button>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

export default FAQsPage;