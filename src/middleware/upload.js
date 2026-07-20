const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const isRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
const UPLOADS_BASE = process.env.UPLOADS_DIR
  || (isRailway ? '/app/data/uploads' : path.join(__dirname, '..', '..', 'public', 'uploads'));

function storageFor(subfolder) {
  const dir = path.join(UPLOADS_BASE, subfolder);
  fs.mkdirSync(dir, { recursive: true });
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`);
    },
  });
}

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new Error('Only JPG, PNG, WEBP, or GIF images are allowed.'));
  }
  cb(null, true);
}

function uploader(subfolder, fieldOptions) {
  const instance = multer({
    storage: storageFor(subfolder),
    fileFilter,
    limits: { fileSize: MAX_SIZE, files: fieldOptions.maxCount || 1 },
  });
  return fieldOptions.fieldName
    ? instance.fields([{ name: fieldOptions.fieldName, maxCount: fieldOptions.maxCount || 1 }])
    : instance.single(fieldOptions.singleField);
}

module.exports = { uploader, MAX_SIZE };
