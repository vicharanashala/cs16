import { useState, useEffect } from 'react';
import { getPins } from '../services/api';

export default function CommunityBoard() {
  const [pins, setPins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [selectedPin, setSelectedPin] = useState(null);

  useEffect(() => {
    getPins()
      .then(res => setPins(res.data || []))
      .catch(() => setPins([]))
      .finally(() => setLoading(false));
  }, []);

  const announcements = pins.filter(pin => pin.type === 'announcement');

  if (loading || announcements.length === 0) return null;

  const typeConfig = {
    announcement: {
      bg: 'bg-white dark:bg-[#22211e]/40',
      border: 'border-slate-200/60 dark:border-slate-800/80',
      badge: 'badge-primary',
      label: 'Announcement',
    }
  };

  const displayedAnnouncements = showAll ? announcements : announcements.slice(0, 3);

  return (
    <div className="mb-8">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3 min-w-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-primary-100 dark:bg-primary-950/40 rounded flex items-center justify-center shrink-0">
            <svg className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide truncate">
            Latest Announcements
          </h2>
        </div>
        {announcements.length > 3 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline cursor-pointer focus:outline-none"
          >
            {showAll ? 'Show Less' : 'View All'}
          </button>
        )}
      </div>

      {/* Grid of announcements */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {displayedAnnouncements.map(pin => {
          const cfg = typeConfig.announcement;
          return (
            <div
              key={pin._id}
              onClick={() => setSelectedPin(pin)}
              className={`relative aspect-square rounded-2xl border ${cfg.border} ${cfg.bg} p-4 flex flex-col justify-between shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer select-none`}
            >
              {/* Title */}
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm leading-snug line-clamp-2 mt-2">
                {pin.title}
              </h3>

              {/* Content */}
              {pin.content ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-3 whitespace-pre-wrap flex-1 mt-1">
                  {pin.content}
                </p>
              ) : null}

              {/* Footer */}
              <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-auto pt-2 border-t border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between">
                {pin.pinnedBy?.name && (
                  <span className="truncate font-medium">by {pin.pinnedBy.name}</span>
                )}
                {pin.order !== undefined && pin.order !== 0 && (
                  <span className="text-slate-300 dark:text-slate-700 shrink-0">#{pin.order + 1}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Details Modal overlay */}
      {selectedPin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setSelectedPin(null)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl dark:shadow-slate-950/50 flex flex-col gap-4 max-h-[90vh] overflow-y-auto animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Announcement Details
              </div>
              <button
                onClick={() => setSelectedPin(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg transition-colors p-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Modal Title */}
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
              {selectedPin.title}
            </h3>

            {/* Modal Body */}
            <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap py-3 border-t border-b border-slate-100 dark:border-slate-850/60 max-h-[50vh] overflow-y-auto">
              {selectedPin.content}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 mt-1">
              {selectedPin.pinnedBy?.name && (
                <span>Published by <span className="font-semibold text-slate-600 dark:text-slate-300">{selectedPin.pinnedBy.name}</span></span>
              )}
              {selectedPin.order !== undefined && selectedPin.order !== 0 && (
                <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-500">#{selectedPin.order + 1}</span>
              )}
            </div>

            {/* Dismiss Button */}
            <button
              onClick={() => setSelectedPin(null)}
              className="mt-2 w-full py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 dark:bg-slate-50 dark:hover:bg-slate-200 text-white dark:text-slate-950 text-sm font-medium transition-all"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
