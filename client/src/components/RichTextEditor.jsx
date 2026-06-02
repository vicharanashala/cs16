import { useRef, useState } from 'react';
import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

export function MarkdownContent({ content }) {
  const [activeImgUrl, setActiveImgUrl] = useState(null);

  if (!content) return null;
  const html = marked.parse(content);

  return (
    <>
      <div
        className="prose dark:prose-invert max-w-none text-slate-800 dark:text-slate-200"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={(e) => {
          if (e.target.tagName === 'IMG') {
            e.preventDefault();
            e.stopPropagation();
            setActiveImgUrl(e.target.src);
          }
        }}
      />

      {activeImgUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm cursor-zoom-out animate-fade-in"
          onClick={() => setActiveImgUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <img
              src={activeImgUrl}
              alt="Preview"
              className="max-w-full max-h-[85vh] rounded-xl shadow-2xl border border-white/10 object-contain select-none animate-zoom-in"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              className="absolute top-4 right-4 bg-black/60 hover:bg-black/85 text-white/80 hover:text-white rounded-full p-2 transition-colors border border-white/10"
              onClick={() => setActiveImgUrl(null)}
              title="Close Preview"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function RichTextEditor({ value, onChange, placeholder, readOnly = false }) {
  const textareaRef = useRef(null);

  const insertWrap = (before, after = before) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.substring(start, end);
    const newText = value.substring(0, start) + before + selected + after + value.substring(end);
    onChange(newText);
    requestAnimationFrame(() => {
      ta.focus();
      const newCursor = start + before.length + (end - start) + after.length;
      ta.setSelectionRange(newCursor, newCursor);
    });
  };

  const toolbarButtons = [
    { label: 'B', title: 'Bold', wrap: ['**', '**'], className: 'font-bold' },
    { label: 'I', title: 'Italic', wrap: ['*', '*'], className: 'italic' },
    { label: 'U', title: 'Underline', wrap: ['<u>', '</u>'], className: 'underline' },
    { label: '—', title: 'Divider', wrap: ['\n---\n', ''], className: '' },
  ];

  if (readOnly) {
    return value ? <MarkdownContent content={value} /> : <span className="text-slate-400">No content</span>;
  }

  return (
    <div className="border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary-200 focus-within:border-primary-400 transition-all">
      {/* Toolbar — text formatting only; file uploads handled by the dedicated Attach Files section */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-600">
        {toolbarButtons.map((btn) => (
          <button
            key={btn.label}
            type="button"
            title={btn.title}
            onClick={() => insertWrap(btn.wrap[0], btn.wrap[1])}
            className={`w-7 h-7 flex items-center justify-center rounded text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200 transition-colors ${btn.className}`}
          >
            {btn.label}
          </button>
        ))}

        <div className="flex-1" />
        <span className="text-xs text-slate-400 dark:text-slate-500">Markdown enabled</span>
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={5}
        className="w-full px-3 py-2.5 text-sm resize-none focus:outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 leading-relaxed"
        style={{ minHeight: '120px' }}
      />
    </div>
  );
}
