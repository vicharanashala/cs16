import { useRef, useState } from 'react';

// ─── Allowed file types & limits ────────────────────────────────────────────
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',                                                    // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
];

const ALLOWED_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|pdf|doc|docx)$/i;

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_FILES = 5;

// Map mime → human-readable label used in the file list icon badge
const FILE_TYPE_LABEL = {
  'application/pdf': 'PDF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
};

/**
 * Returns a short type badge string for non-image files.
 * Returns null for images (they get a thumbnail instead).
 */
function getFileTypeBadge(file) {
  return FILE_TYPE_LABEL[file.type] || null;
}

/**
 * FileUpload — reusable drag-and-drop / browse component.
 *
 * Props:
 *   files      {Array<File>}  — controlled list of selected File objects
 *   onChange   {Function}     — called with the new files array on any change
 *   maxFiles   {number}       — override default MAX_FILES (optional)
 *   disabled   {boolean}      — disable all interaction (e.g. during submit)
 */
export default function FileUpload({ files = [], onChange, maxFiles = MAX_FILES, disabled = false }) {
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // ── Validation ─────────────────────────────────────────────────────────────
  /**
   * Validates a list of incoming File objects against type, size, and count
   * limits.  Returns { valid: File[], error: string|null }.
   */
  const validate = (incoming) => {
    const remaining = maxFiles - files.length;
    if (remaining <= 0) {
      return { valid: [], error: `You can attach a maximum of ${maxFiles} files.` };
    }

    const toAdd = incoming.slice(0, remaining);

    for (const file of toAdd) {
      // Check by extension as well as MIME to handle edge cases (e.g. .docx on Windows)
      const extOk = ALLOWED_EXTENSIONS.test(file.name);
      const mimeOk = ALLOWED_MIME_TYPES.includes(file.type);
      if (!extOk && !mimeOk) {
        return {
          valid: [],
          error: `"${file.name}" is not supported. Allowed types: JPG, PNG, GIF, WebP, PDF, DOC, DOCX.`
        };
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return {
          valid: [],
          error: `"${file.name}" exceeds the ${MAX_FILE_SIZE_MB} MB size limit.`
        };
      }
    }

    // Deduplicate by name+size so the same file can't be added twice
    const existing = new Set(files.map(f => `${f.name}-${f.size}`));
    const deduped = toAdd.filter(f => !existing.has(`${f.name}-${f.size}`));

    return { valid: deduped, error: null };
  };

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleFiles = (incoming) => {
    if (disabled) return;
    setError('');
    const { valid, error: validationError } = validate(Array.from(incoming));
    if (validationError) {
      setError(validationError);
      return;
    }
    if (valid.length > 0) {
      onChange([...files, ...valid]);
    }
  };

  const handleInputChange = (e) => {
    handleFiles(e.target.files);
    // Reset input so the same file can be re-selected after removal
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleRemove = (index) => {
    if (disabled) return;
    setError('');
    onChange(files.filter((_, i) => i !== index));
  };

  const isFull = files.length >= maxFiles;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Drop zone — hidden when at capacity */}
      {!isFull && (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="Attach files — click or drag and drop"
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
          onDragEnter={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => !disabled && inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && !disabled && inputRef.current?.click()}
          className={`
            relative flex flex-col items-center justify-center gap-2
            border-2 border-dashed rounded-xl px-4 py-6 text-center
            transition-colors select-none cursor-pointer
            ${disabled
              ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 cursor-not-allowed opacity-50'
              : dragOver
                ? 'border-primary-400 dark:border-primary-500 bg-primary-50/40 dark:bg-primary-900/20'
                : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-primary-50/20 dark:hover:bg-primary-900/10'
            }
          `}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx"
            className="hidden"
            onChange={handleInputChange}
            disabled={disabled}
            aria-hidden="true"
          />

          {/* Upload icon */}
          <svg
            className={`w-8 h-8 ${dragOver ? 'text-primary-400' : 'text-slate-400 dark:text-slate-500'} transition-colors`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>

          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {dragOver ? 'Drop files here' : 'Drag & drop files here'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              or <span className="text-primary-500 dark:text-primary-400 font-medium">click to browse</span>
            </p>
          </div>

          {/* Accepted formats hint */}
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            JPG, PNG, GIF, WebP, PDF, DOC, DOCX · max {MAX_FILE_SIZE_MB} MB each · up to {maxFiles} files
          </p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
          <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}

      {/* Selected file list */}
      {files.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label="Selected files">
          {files.map((file, idx) => {
            const badge = getFileTypeBadge(file);
            const isImage = file.type.startsWith('image/');
            // Create an object URL for image previews (revoked on unmount by browser GC)
            const previewUrl = isImage ? URL.createObjectURL(file) : null;

            return (
              <li
                key={`${file.name}-${file.size}-${idx}`}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 group"
              >
                {/* Thumbnail or type badge */}
                {isImage && previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={file.name}
                    className="w-10 h-10 rounded-md object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-md shrink-0 flex items-center justify-center bg-slate-200 dark:bg-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                    {badge}
                  </div>
                )}

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  disabled={disabled}
                  aria-label={`Remove ${file.name}`}
                  className="shrink-0 p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* "Add more" link when files are attached but under the cap */}
      {files.length > 0 && files.length < maxFiles && (
        <button
          type="button"
          onClick={() => !disabled && inputRef.current?.click()}
          disabled={disabled}
          className="mt-2 text-xs text-primary-500 dark:text-primary-400 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add more files ({files.length}/{maxFiles})
        </button>
      )}

      {/* At-capacity notice */}
      {isFull && (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          Maximum {maxFiles} files attached.{' '}
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={disabled}
            className="text-red-400 hover:underline disabled:opacity-40"
          >
            Clear all
          </button>
        </p>
      )}
    </div>
  );
}
