const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Configure multer: store to disk, generate timestamped filenames
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});

// Allowed MIME types: images + PDF + Word documents
const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',                                                     // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
]);

// Allowed extensions (fallback check alongside MIME)
const ALLOWED_EXT = /\.(jpg|jpeg|png|gif|webp|pdf|doc|docx)$/i;

const fileFilter = (req, file, cb) => {
  const extOk = ALLOWED_EXT.test(path.extname(file.originalname).toLowerCase());
  const mimeOk = ALLOWED_MIMES.has(file.mimetype);
  if (extOk || mimeOk) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type. Allowed: JPG, PNG, GIF, WebP, PDF, DOC, DOCX.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB per file
});

// POST /api/upload — single file upload, returns { url, filename, mimetype }
router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  res.json({
    url: `/uploads/${req.file.filename}`,
    filename: req.file.originalname,
    mimetype: req.file.mimetype
  });
});

// Handle multer errors (e.g. file too large, unsupported type)
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File exceeds the 10 MB size limit.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message });
  next();
});

module.exports = router;
