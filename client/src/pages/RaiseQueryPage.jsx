import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createQuery, searchSimilar, detectTags, getCategoryContributors, uploadFile } from '../services/api';
import { useAuth } from '../context/AuthContext';
import RichTextEditor from '../components/RichTextEditor';
import TagInput from '../components/TagInput';
import FileUpload from '../components/FileUpload';

const MAX_TAGS = 3;
const MAX_WORDS = 500;
const getWordCount = (text) => text?.trim() ? text.trim().split(/\s+/).length : 0;

function RaiseQueryPage() {
  const [form, setForm] = useState({ title: '', description: '' });
  const [tags, setTags] = useState([]);
  const [detectingTags, setDetectingTags] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [suggestedContributors, setSuggestedContributors] = useState([]);
  const [taggedUsers, setTaggedUsers] = useState([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [submittedQueryId, setSubmittedQueryId] = useState(null);

  // ── Attached files (File objects held locally until submit) ───────────────
  const [attachedFiles, setAttachedFiles] = useState([]);

  const [similarFAQs, setSimilarFAQs] = useState([]);
  const [similarQueries, setSimilarQueries] = useState([]);
  const [resolvedQueries, setResolvedQueries] = useState([]);
  const [highConfidenceDuplicate, setHighConfidenceDuplicate] = useState(null);
  const [isInScope, setIsInScope] = useState(true);
  const [duplicateType, setDuplicateType] = useState(null);

  const searchTimerRef = useRef(null);
  const tagTimerRef = useRef(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user && !localStorage.getItem('token')) {
      navigate('/login', { state: { from: '/ask' } });
    }
    if (user?.role === 'admin') {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('query_draft');
      if (saved) {
        const { title, description, tags: savedTags } = JSON.parse(saved);
        setForm({ title: title || '', description: description || '' });
        if (Array.isArray(savedTags)) setTags(savedTags);
      }
    } catch (e) {
      console.error('Failed to load draft:', e);
    }
  }, []);

  // ── Duplicate search — fires 500ms after title stops changing ──────────────
  useEffect(() => {
    clearTimeout(searchTimerRef.current);

    if (!form.title.trim() || form.title.length < 5) {
      setSimilarFAQs([]);
      setSimilarQueries([]);
      setResolvedQueries([]);
      setHighConfidenceDuplicate(null);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await searchSimilar(form.title);
        const data = res.data;
        setSimilarFAQs(data.faqs || []);
        setSimilarQueries(data.queries || []);
        setResolvedQueries(data.resolvedQueries || []);
        setIsInScope(data.isInScope !== undefined ? data.isInScope : true);
        if (data.highConfidenceDuplicate && !highConfidenceDuplicate) {
          setHighConfidenceDuplicate(data.highConfidenceDuplicate);
          setDuplicateType('query');
        }
      } catch (err) {
        console.error('Similar search failed:', err);
      }
    }, 500);

    return () => clearTimeout(searchTimerRef.current);
  }, [form.title]);

  // ── Tag auto-detection — fires 1s after typing pauses ──────────────────────
  useEffect(() => {
    clearTimeout(tagTimerRef.current);
    if (!form.title.trim() && !form.description.trim()) return;

    setDetectingTags(true);
    tagTimerRef.current = setTimeout(async () => {
      try {
        const res = await detectTags(`${form.title} ${form.description}`);
        if (Array.isArray(res.data) && tags.length < MAX_TAGS) {
          const newTags = res.data.filter(t => !tags.includes(t)).slice(0, MAX_TAGS - tags.length);
          if (newTags.length > 0) setTags(prev => [...prev, ...newTags]);
        } else if (Array.isArray(res.data.detectedTags) && tags.length < MAX_TAGS) {
          const newTags = res.data.detectedTags.filter(t => !tags.includes(t)).slice(0, MAX_TAGS - tags.length);
          if (newTags.length > 0) setTags(prev => [...prev, ...newTags]);
        }
      } catch (err) {
        // Silently fail tag detection
      } finally {
        setDetectingTags(false);
      }
    }, 1000);

    return () => clearTimeout(tagTimerRef.current);
  }, [form.title, form.description]);

  // ── Fetch active category responders ──────────────────────────────────────
  useEffect(() => {
    const primaryTag = tags[0];
    if (!primaryTag) {
      setSuggestedContributors([]);
      setTaggedUsers([]);
      return;
    }

    const fetchContributors = async () => {
      try {
        const res = await getCategoryContributors(primaryTag, { week: true });
        setSuggestedContributors(res.data || []);
      } catch (err) {
        console.error('Failed to fetch category contributors:', err);
      }
    };

    fetchContributors();
  }, [tags[0]]);

  const toggleTagContributor = (contrib) => {
    const isAlreadyTagged = taggedUsers.includes(contrib._id);
    const tagStr = ` @${contrib.name}`;
    if (isAlreadyTagged) {
      setTaggedUsers(prev => prev.filter(id => id !== contrib._id));
      if (form.description.endsWith(tagStr)) {
        setForm(prev => ({
          ...prev,
          description: prev.description.substring(0, prev.description.length - tagStr.length)
        }));
      } else if (form.description.includes(tagStr)) {
        setForm(prev => ({
          ...prev,
          description: prev.description.replace(tagStr, '')
        }));
      }
    } else {
      setTaggedUsers(prev => [...prev, contrib._id]);
      setForm(prev => ({
        ...prev,
        description: prev.description + tagStr
      }));
    }
  };

  const handleSaveDraft = () => {
    if (!form.title.trim() && !form.description.trim()) {
      setError('Please add a title or description before saving a draft.');
      return;
    }
    const draft = { title: form.title, description: form.description, tags };
    localStorage.setItem('query_draft', JSON.stringify(draft));
    setError('');
    alert('Query draft saved successfully!');
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const descriptionWordCount = getWordCount(form.description);
    if (descriptionWordCount > MAX_WORDS) {
      setError(`Description cannot exceed ${MAX_WORDS} words`);
      return;
    }

    if (!form.title.trim() || !form.description.trim()) {
      setError('Title and description are required');
      return;
    }
    if (!user) { navigate('/login'); return; }

    try {
      setSubmitting(true);

      // Upload each attached file sequentially and collect server-side references
      const uploadedAttachments = [];
      for (const file of attachedFiles) {
        const res = await uploadFile(file);
        uploadedAttachments.push({
          url:      res.data.url,
          filename: res.data.filename,
          mimetype: res.data.mimetype
        });
      }

      const res = await createQuery({
        title: form.title.trim(),
        description: form.description.trim(),
        tags,
        taggedUsers,
        attachments: uploadedAttachments
      });
      localStorage.removeItem('query_draft'); // Clear draft on success
      setSubmittedQueryId(res.data.query._id);
      setShowSuccessModal(true);
    } catch (err) {
      const data = err.response?.data;
      if (data?.duplicateFaqId) {
        setHighConfidenceDuplicate({
          _id: data.duplicateFaqId,
          title: data.duplicateTitle,
          acceptedAnswer: { content: data.duplicateFaqAnswer }
        });
        setDuplicateType('faq');
        setError('');
        return;
      }
      if (data?.duplicateQueryId) {
        setHighConfidenceDuplicate({
          _id: data.duplicateQueryId,
          title: data.duplicateTitle,
          acceptedAnswer: data.acceptedAnswer
        });
        setDuplicateType('query');
        setError('');
        return;
      }
      if (err.response?.status === 429) {
        setError(data?.error || 'Cooldown active');
        return;
      }
      setError(data?.error || 'Failed to submit query');
    } finally {
      setSubmitting(false);
    }
  };

  const hasSuggestions = similarFAQs.length > 0 || (isInScope && similarQueries.length > 0) || resolvedQueries.length > 0;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-1">
          Raise a Query
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Can't find an answer? Ask the community — someone will help within 24 hours.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      {!isInScope && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl p-4 mb-6 text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-200 mb-1">
            ⚠️ Your question may be outside the platform's scope
          </p>
          <p className="text-amber-700 dark:text-amber-300 text-xs">
            This platform is for questions about <strong>Grantha</strong> — VINS, ViBe LMS, Phase 1/2/3, NOC,
            offer letters, Rosetta, team formation, and related topics.{' '}
            If your question is about something else (college exams, other programmes, off-topic), it may not
            get a relevant answer here.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Question <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            className="input"
            placeholder="e.g., How do I apply for fee concession?"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            maxLength={200}
          />
          <p className="text-xs text-slate-400 mt-1 text-right">{form.title.length}/200</p>
        </div>

        {/* High-confidence duplicate banner */}
        {highConfidenceDuplicate && (
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-700 p-4 rounded-xl">
            {duplicateType === 'faq' ? (
              <>
                <p className="font-semibold text-emerald-800 dark:text-emerald-200 mb-1 flex items-center gap-1.5">
                  ✓ This question is already answered in our FAQ knowledge base
                </p>
                <p className="text-slate-700 dark:text-slate-300 font-medium mb-2">
                  {highConfidenceDuplicate.title}
                </p>
                {highConfidenceDuplicate.acceptedAnswer?.content && (
                  <p className="text-slate-600 dark:text-slate-400 text-sm line-clamp-2 mb-3">
                    {highConfidenceDuplicate.acceptedAnswer.content}
                  </p>
                )}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/wiki?highlight=${highConfidenceDuplicate._id}`)}
                    className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    Read the full answer in Wiki →
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="font-semibold text-emerald-800 dark:text-emerald-200 mb-1 flex items-center gap-1.5">
                  ✓ This question is already answered in the community
                </p>
                <p className="text-slate-700 dark:text-slate-300 font-medium mb-2">
                  {highConfidenceDuplicate.title}
                </p>
                {highConfidenceDuplicate.acceptedAnswer?.content && (
                  <p className="text-slate-600 dark:text-slate-400 text-sm line-clamp-2 mb-3">
                    {highConfidenceDuplicate.acceptedAnswer.content}
                  </p>
                )}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/community?highlight=${highConfidenceDuplicate._id}`)}
                    className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    View in Community →
                  </button>
                  <button
                    type="button"
                    onClick={() => { setHighConfidenceDuplicate(null); setForm({ ...form, title: '' }); }}
                    className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400"
                  >
                    Ask a different question instead
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Similarity panel */}
        {hasSuggestions && !highConfidenceDuplicate && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden text-sm">
            {similarFAQs.length > 0 && (
              <div className="p-4 border-b border-slate-100 dark:border-slate-700">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                  Similar FAQs
                </p>
                <ul className="space-y-2">
                  {similarFAQs.map(faq => (
                    <li key={faq._id}>
                      <Link
                        to={`/wiki?highlight=${faq._id}`}
                        className="flex items-start gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg p-2 -m-2 transition-colors"
                      >
                        <span className="text-primary-400 mt-0.5">→</span>
                        <div>
                          <p className="text-slate-800 dark:text-slate-200 font-medium leading-snug">
                            {faq.title}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 line-clamp-1">
                            {faq.finalAnswer}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isInScope && similarQueries.length > 0 && (
              <div className="p-4">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                  Open community queries
                </p>
                <ul className="space-y-1.5">
                  {similarQueries.map(q => (
                    <li key={q._id} className="flex items-center justify-between gap-3">
                      <p className="text-slate-700 dark:text-slate-300 leading-snug">{q.title}</p>
                      <span className="badge badge-yellow shrink-0">{q.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Description <span className="text-red-400">*</span>
          </label>
          <RichTextEditor
            value={form.description}
            onChange={val => setForm({ ...form, description: val })}
            placeholder="Provide more context — include course, semester, or any relevant details..."
          />
          {getWordCount(form.description) > MAX_WORDS && (
            <p className="text-xs text-red-500 mt-2">
              Description exceeds the {MAX_WORDS}-word limit.
            </p>
          )}
        </div>

        {/* ── Attach Files ──────────────────────────────────────────────────── */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Attach Files
            <span className="text-xs font-normal text-slate-400 ml-1.5">(optional)</span>
          </label>
          <FileUpload
            files={attachedFiles}
            onChange={setAttachedFiles}
            disabled={submitting}
          />
        </div>

        {/* Suggested contributors */}
        {suggestedContributors.length > 0 && (
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mt-3">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                <span>💡</span> Suggested Active Responders in Category
              </p>
              {taggedUsers.length >= 2 && (
                <span className="text-[10px] text-amber-500 font-medium animate-pulse">(Max 2 tags reached)</span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {suggestedContributors.map(contrib => {
                const isTagged = taggedUsers.includes(contrib._id);
                const isLimitReached = taggedUsers.length >= 2;
                const isDisabled = !isTagged && isLimitReached;
                return (
                  <div 
                    key={contrib._id} 
                    className={`flex flex-col justify-between p-3 rounded-xl border shadow-sm transition-all duration-200 ${
                      isTagged
                        ? 'bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-350 dark:border-emerald-850 ring-2 ring-emerald-500/5'
                        : 'bg-white dark:bg-slate-950 border-slate-150 dark:border-slate-800/80'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`text-xs font-bold truncate ${isTagged ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-350'}`}>
                        {contrib.name}
                      </p>
                      <p className="text-[10px] text-primary-600 dark:text-primary-400 font-semibold mt-0.5">{contrib.reputation} rep</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleTagContributor(contrib)}
                      disabled={isDisabled}
                      className={`mt-2.5 w-full py-1.5 rounded-md text-[10px] font-semibold transition-all ${
                        isTagged
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
                          : isDisabled
                            ? 'bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-600 cursor-not-allowed'
                            : 'bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-950/30 dark:text-primary-400'
                      }`}
                    >
                      {isTagged ? '✓ Tagged' : 'Tag Contributor'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tags */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Tags
              <span className="text-xs font-normal text-slate-400 ml-1.5">(up to {MAX_TAGS})</span>
            </label>
            {detectingTags && (
              <span className="text-xs text-indigo-400 animate-pulse">detecting tags…</span>
            )}
          </div>
          <TagInput tags={tags} onChange={setTags} maxTags={MAX_TAGS} />
          <p className="text-xs text-slate-400 mt-1">
            Tags are auto-suggested as you type. You can edit them freely.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || !form.title.trim() || !form.description.trim() || getWordCount(form.description) > MAX_WORDS}
            className="btn-primary px-6 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting
              ? attachedFiles.length > 0
                ? 'Uploading & Submitting…'
                : 'Submitting…'
              : 'Submit Query'}
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={submitting || (!form.title.trim() && !form.description.trim())}
            className="px-5 py-2.5 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 rounded-xl text-sm font-semibold transition-all duration-150"
          >
            Save Draft
          </button>
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost text-slate-500">
            Cancel
          </button>
        </div>
      </form>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl text-center space-y-4 animate-zoom-in">
            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center text-2xl mx-auto">
              ✓
            </div>
            <h3 className="text-lg font-serif font-bold text-slate-900 dark:text-slate-100">
              Query Submitted Successfully!
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Your query has been posted to the community board. The expected response time under our community SLA is <strong>within 24 hours</strong>.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => navigate(`/track-query?highlight=${submittedQueryId}`)}
                className="w-full btn-primary py-2.5 text-sm font-semibold"
              >
                Track Your Query
              </button>
              <button
                type="button"
                onClick={() => navigate(`/community?highlight=${submittedQueryId}`)}
                className="w-full py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl transition-all"
              >
                Go to Community Board
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RaiseQueryPage;
