import { useRef, useState, useEffect } from 'react';
import { marked } from 'marked';
import { uploadImage } from '../services/api';

marked.setOptions({ breaks: true, gfm: true });

export function MarkdownContent({ content, taggedUsers }) {
  const [activeImgUrl, setActiveImgUrl] = useState(null);

  if (!content) return null;

  let processed = content;
  if (taggedUsers && Array.isArray(taggedUsers)) {
    taggedUsers.forEach(u => {
      if (u && u.name) {
        const escapedName = u.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`@${escapedName}`, 'gi');
        processed = processed.replace(regex, `<span class="mention bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-lg font-bold border border-emerald-250/20 dark:border-emerald-800/30 select-all">@${u.name}</span>`);
      }
    });
  }

  const html = marked.parse(processed);

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
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function RichTextEditor({ value, onChange, placeholder, readOnly = false, draftKey }) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [isDraggingEditor, setIsDraggingEditor] = useState(false);
  const [isDraggingDropzone, setIsDraggingDropzone] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [showToast, setShowToast] = useState(false);

  const MAX_WORDS = 500;
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const progressPct = Math.min(100, Math.round((wordCount / MAX_WORDS) * 100));
  const isWarning = wordCount >= MAX_WORDS * 0.9;
  const isOverLimit = wordCount > MAX_WORDS;
  const barColor = isOverLimit ? 'bg-red-500' : isWarning ? 'bg-amber-400 dark:bg-amber-300' : 'bg-slate-400 dark:bg-slate-500';
  const textColor = isOverLimit ? 'text-red-500 dark:text-red-400' : isWarning ? 'text-amber-500 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400';

  const storageKey = draftKey || `editor-draft-${placeholder ? placeholder.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'general'}`;

  useEffect(() => {
    if (readOnly) return;
    const savedDraft = localStorage.getItem(storageKey);
    if (savedDraft && !value) {
      onChange(savedDraft);
      setShowToast(true);
      const toastTimer = setTimeout(() => {
        setShowToast(false);
      }, 3000);
      return () => clearTimeout(toastTimer);
    }
  }, [storageKey, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    if (!value) {
      localStorage.removeItem(storageKey);
      return;
    }
    const saveTimer = setTimeout(() => {
      localStorage.setItem(storageKey, value);
    }, 800);
    return () => clearTimeout(saveTimer);
  }, [value, storageKey, readOnly]);

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

  const insertAtCursor = (text) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newText = value.substring(0, start) + text + value.substring(end);
    onChange(newText);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const uploadFile = async (file) => {
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      alert('Please upload image files only.');
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert('Only JPEG, PNG, GIF, and WebP images are allowed.');
      return;
    }
    setUploading(true);
    try {
      const res = await uploadImage(file);
      const url = res.data.url;
      setUploadedFiles(prev => [...prev, { name: file.name, url }]);
      insertAtCursor(`\n![${file.name}](${url})\n`);
    } catch (err) {
      console.error('Image upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      await uploadFile(file);
    }
    e.target.value = '';
  };

  const handleEditorDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!readOnly) setIsDraggingEditor(true);
  };

  const handleEditorDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingEditor(false);
  };

  const handleEditorDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingEditor(false);

    if (readOnly) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await uploadFile(files[0]);
    }
  };

  const handleDropzoneDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!readOnly) setIsDraggingDropzone(true);
  };

  const handleDropzoneDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingDropzone(false);
  };

  const handleDropzoneDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingDropzone(false);

    if (readOnly) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await uploadFile(files[0]);
    }
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
    <div className="relative w-full space-y-3">
      {/* ✨ CLEAN INLINE TOAST NOTIFICATION BLOCK */}
      {showToast && (
        <div className="absolute top-2 right-2 z-50 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-white shadow-md border border-emerald-400/20 animate-fade-in select-none">
          <span>✨ Draft restored successfully</span>
          <button type="button" onClick={() => setShowToast(false)} className="hover:opacity-80 font-bold ml-1">✕</button>
        </div>
      )}

      {/* Editor border container */}
      <div
        onDragOver={handleEditorDragOver}
        onDragLeave={handleEditorDragLeave}
        onDrop={handleEditorDrop}
        className={`border rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary-200 focus-within:border-primary-400 transition-all duration-200 ${
          isDraggingEditor
            ? 'border-dashed border-primary-500 bg-primary-50/10 dark:bg-primary-950/10'
            : 'border-slate-300 dark:border-slate-600'
        }`}
      >
        {/* Toolbar */}
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

          <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

          {/* Image upload button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleImageUpload}
          />
          <button
            type="button"
            title="Add image"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={`w-7 h-7 flex items-center justify-center rounded text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200 transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {uploading ? '…' : '📷'}
          </button>

          <div className="flex-1" />
          <span className="text-xs text-slate-400 dark:text-slate-500">Markdown enabled</span>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 text-sm resize-y focus:outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 leading-relaxed"
          style={{ minHeight: '150px' }}
        />
      </div>

      {/* Word Count / Progress and Drop status indicator */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {isDraggingEditor ? 'Drop image here to insert' : ''}
        </span>
        <div className="flex items-center gap-2">
          <div className="relative w-20 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 rounded-full ${barColor}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className={`text-[10px] font-medium ${textColor}`}>
            {wordCount}/{MAX_WORDS}
          </span>
        </div>
      </div>

      {/* Dedicated Media Upload Box (Drag and Drop Card) */}
      <div
        onDragOver={handleDropzoneDragOver}
        onDragLeave={handleDropzoneDragLeave}
        onDrop={handleDropzoneDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-200 ${
          isDraggingDropzone
            ? 'border-primary-500 bg-primary-50/20 dark:bg-primary-950/10'
            : 'border-slate-200 dark:border-slate-700 hover:border-primary-400 hover:bg-slate-50 dark:hover:bg-slate-900/30'
        }`}
      >
        <div className="flex flex-col items-center justify-center space-y-2 select-none">
          <span className="text-2xl text-slate-400 dark:text-slate-500">
            {uploading ? '⏳' : '📥'}
          </span>
          <p className="text-xs font-semibold text-slate-650 dark:text-slate-350">
            {uploading
              ? 'Uploading media, please wait...'
              : 'Drag & drop image here, or click to upload media'}
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            Supports JPG, PNG, GIF, WebP (Max. 5MB)
          </p>
        </div>
      </div>

      {/* Previews / Gallery of uploaded images in current session */}
      {uploadedFiles.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800/80 rounded-xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider select-none">
            Uploaded Media ({uploadedFiles.length})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {uploadedFiles.map((file, idx) => (
              <div
                key={idx}
                className="group relative border border-slate-200/60 dark:border-slate-800/80 rounded-xl overflow-hidden bg-white dark:bg-slate-900 p-2 flex flex-col justify-between"
              >
                <div className="h-16 w-full overflow-hidden rounded-lg bg-slate-50 dark:bg-slate-950 flex items-center justify-center border border-slate-100 dark:border-slate-900">
                  <img
                    src={file.url}
                    alt={file.name}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="mt-2 flex flex-col">
                  <span className="text-[10px] font-semibold text-slate-655 dark:text-slate-450 truncate" title={file.name}>
                    {file.name}
                  </span>
                  <div className="flex gap-2.5 mt-1 pt-1.5 border-t border-slate-50 dark:border-slate-850">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        insertAtCursor(`\n![${file.name}](${file.url})\n`);
                      }}
                      className="text-[10px] text-primary-600 dark:text-primary-400 hover:underline font-bold"
                    >
                      Insert Link
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(`![${file.name}](${file.url})`);
                        alert('Markdown link copied to clipboard!');
                      }}
                      className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-350 hover:underline font-bold"
                    >
                      Copy Link
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}