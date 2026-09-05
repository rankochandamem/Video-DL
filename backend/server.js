require('dotenv').config();
const path = require('path');
const fs = require('fs');
const dns = require('dns').promises;
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const providers = [
  require('./providers/direct/provider'), require('./providers/youtube/provider'),
  require('./providers/facebook/provider'), require('./providers/instagram/provider'),
  require('./providers/twitter/provider'), require('./providers/tiktok/provider')
];

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const maxFileSize = Number(process.env.MAX_FILE_SIZE_MB || 2048) * 1024 * 1024;
const maxConcurrent = Number(process.env.MAX_CONCURRENT_DOWNLOADS || 3);
let activeDownloads = 0;

function getAllowedOrigins() {
  const configuredOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const renderOrigin = process.env.RENDER_EXTERNAL_HOSTNAME
    ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
    : null;

  return [...new Set([
    `http://localhost:${port}`,
    'http://localhost:3000',
    `http://127.0.0.1:${port}`,
    'http://127.0.0.1:3000',
    `http://localhost:3001`,
    `http://127.0.0.1:3001`,
    renderOrigin,
    ...configuredOrigins
  ].filter(Boolean))];
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:', 'https:'],
      mediaSrc: ["'self'", 'https:'], connectSrc: ["'self'", 'https:'], frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com', 'https://www.tiktok.com', 'https://www.facebook.com'],
      objectSrc: ["'none'"]
    }
  }
}));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowedOrigins = getAllowedOrigins();
    const isAllowed = allowedOrigins.includes(origin)
      || allowedOrigins.some((allowed) => allowed.includes('render.com') && origin.endsWith('.onrender.com'))
      || allowedOrigins.some((allowed) => allowed.includes('localhost') && /^http:\/\/localhost:\d+$/.test(origin))
      || /^http:\/\/(192\.168|10|172\.(1[6-9]|2\d|3[0-1]))\.\d+\.\d+:\d+$/.test(origin);

    if (isAllowed) return callback(null, true);
    console.warn('CORS blocked origin:', origin);
    console.warn('Allowed origins:', allowedOrigins);
    callback(new Error('CORS_ORIGIN_NOT_ALLOWED'));
  }
}));
app.use(express.json({ limit: '16kb' }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));

function normalizeUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('INVALID_URL');
  let parsed;
  try { parsed = new URL(value.trim()); } catch { throw new Error('INVALID_URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('INVALID_URL');
  return parsed.toString();
}

function isPrivateAddress(address) {
  const normalized = address.replace(/^::ffff:/, '').toLowerCase();
  return normalized === 'localhost' || normalized === '::1' || normalized === '0.0.0.0' ||
    /^127\./.test(normalized) || /^10\./.test(normalized) || /^192\.168\./.test(normalized) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized) || /^169\.254\./.test(normalized) ||
    /^fc|^fd|^fe80:/.test(normalized);
}

async function assertPublicUrl(url) {
  const hostname = new URL(url).hostname;
  if (isPrivateAddress(hostname)) throw new Error('BLOCKED_HOST');
  const records = await dns.lookup(hostname, { all: true });
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) throw new Error('BLOCKED_HOST');
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try { return await fetch(url, { ...options, redirect: 'manual', signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

function isHostedRenderEnvironment() {
  return Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_HOSTNAME || process.env.VERCEL || process.env.NETLIFY);
}

function findProvider(url) { return providers.find((provider) => provider.detect(url)); }
function errorResponse(error) {
  const messages = {
    INVALID_URL: ['Invalid Link', 'Please enter a valid media URL.'], BLOCKED_HOST: ['Unable to Process This URL', 'This address is not allowed.'],
    PROVIDER_UNAVAILABLE: ['Unable to Process This URL', 'This provider may restrict automated access or require an authorized API.'],
    TIKTOK_FORMATS_UNAVAILABLE: ['TikTok Download Unavailable', 'TikTok provided a preview, but no downloadable media format was available. Try the canonical public video link again.'],
    YOUTUBE_BLOCKED_ON_HOSTING: ['YouTube is not available', 'This hosting environment cannot reliably access YouTube. Use a VPS or machine with a normal public IP, or switch to an authorized YouTube API integration.'],
    PHOTO_UNAVAILABLE: ['Photo Unavailable', 'Facebook did not expose a downloadable image URL for this photo page. Try a direct public image URL.'], PRIVATE_CONTENT: ['Private or Restricted Content', 'Facebook requires registration or access permission for this media. MediaDrop cannot bypass that restriction.'],
    MEDIA_UNAVAILABLE: ['Media Unavailable', 'The requested media could not be retrieved.'], FILE_TOO_LARGE: ['File Too Large', 'This file exceeds the configured size limit.']
  };
  const [title, message] = messages[error.message] || ['Something Went Wrong', 'Please try again later.'];
  return { status: error.message === 'INVALID_URL' ? 400 : 422, body: { success: false, error: title, message } };
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'mediadrop' }));
app.get('/api/speed-test', (_req, res) => {
  const sample = Buffer.alloc(2 * 1024 * 1024);
  res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Content-Type': 'application/octet-stream', 'Content-Length': sample.length });
  res.end(sample);
});
app.post('/api/speed-test', express.raw({ type: 'application/octet-stream', limit: '1mb' }), (_req, res) => res.json({ success: true }));
app.get('/api/media/preview', async (req, res) => {
  try {
    const url = normalizeUrl(req.query.url);
    await assertPublicUrl(url);
    const provider = findProvider(url);
    if (!provider || !provider.download) throw new Error('PROVIDER_UNAVAILABLE');
    const source = provider.getPreview ? await provider.getPreview(url, req.query.formatId) : await provider.download(url, req.query.formatId);
    if (source.filePath) {
      const fileStats = await fs.promises.stat(source.filePath);
      res.setHeader('Content-Type', source.contentType || 'video/mp4');
      res.setHeader('Content-Length', fileStats.size);
      const cleanup = () => fs.promises.unlink(source.filePath).catch(() => {});
      res.once('close', cleanup);
      res.once('finish', cleanup);
      fs.createReadStream(source.filePath).on('error', cleanup).pipe(res);
      return;
    }
    const headers = req.headers.range ? { Range: req.headers.range } : {};
    const upstream = await fetchWithTimeout(source.url, { headers });
    if (!upstream.ok || !upstream.body) throw new Error('MEDIA_UNAVAILABLE');
    res.status(upstream.status);
    res.setHeader('Content-Type', source.contentType || upstream.headers.get('content-type') || 'video/mp4');
    for (const header of ['content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(header); if (value) res.setHeader(header, value);
    }
    const reader = upstream.body.getReader();
    const pump = async () => { const { done, value } = await reader.read(); if (done) return res.end(); res.write(value); return pump(); };
    await pump();
  } catch (error) { if (!res.headersSent) { const result = errorResponse(error); res.status(result.status).json(result.body); } }
});
app.post('/api/media/info', async (req, res) => {
  try {
    const url = normalizeUrl(req.body?.url);
    await assertPublicUrl(url);
    const provider = findProvider(url);
    if (!provider) return res.status(422).json({ success: false, error: 'Unsupported Platform', message: "This URL isn't currently supported." });
    const info = await provider.getMediaInfo(url, { fetchWithTimeout, maxFileSize });
    res.json({ success: true, url, ...info });
  } catch (error) {
    console.error('MEDIA INFO ERROR:', {
      message: error?.message,
      stack: error?.stack,
      url: req.body?.url
    });

    const result = errorResponse(error);
    res.status(result.status).json(result.body);
  }
});

app.post('/api/media/transcript', async (req, res) => {
  try {
    const url = normalizeUrl(req.body?.url);
    await assertPublicUrl(url);
    const provider = findProvider(url);
    if (!provider || !provider.getTranscript) throw new Error('PROVIDER_UNAVAILABLE');
    const transcript = await provider.getTranscript(url);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${transcript.filename.replace(/[^a-z0-9._-]/gi, '_')}"`);
    res.send(transcript.text);
  } catch (error) {
    const result = errorResponse(error);
    res.status(result.status).json(result.body);
  }
});

app.post('/api/media/download', async (req, res) => {
  if (activeDownloads >= maxConcurrent) return res.status(429).json({ success: false, error: 'Too Many Requests', message: 'Please wait a moment before trying again.' });
  let url;
  let releaseSlot = () => {};
  try {
    url = normalizeUrl(req.body?.url); await assertPublicUrl(url);
    const provider = findProvider(url);
    if (!provider || !provider.download && provider.name !== 'direct') throw new Error('PROVIDER_UNAVAILABLE');
    activeDownloads += 1;
    let released = false;
    releaseSlot = () => { if (!released) { released = true; activeDownloads -= 1; } };
    res.once('close', releaseSlot);
    const source = provider.name === 'direct' ? { url, contentType: null, filename: path.basename(new URL(url).pathname) } : await provider.download(url, req.body?.formatId, { maxFileSize });
    if (source.filePath) {
      const fileStats = await fs.promises.stat(source.filePath);
      if (fileStats.size > maxFileSize) throw new Error('FILE_TOO_LARGE');
      res.setHeader('Content-Type', source.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${source.filename.replace(/[^a-z0-9._-]/gi, '_')}"`);
      res.setHeader('Content-Length', fileStats.size);
      await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(source.filePath);
        const cleanup = () => fs.promises.unlink(source.filePath).catch(() => {}).finally(resolve);
        stream.on('error', reject); res.once('close', cleanup); res.once('finish', cleanup); stream.pipe(res);
      });
      return;
    }
    const upstream = await fetchWithTimeout(source.url);
    if (!upstream.ok || !upstream.body) throw new Error('MEDIA_UNAVAILABLE');
    const size = Number(upstream.headers.get('content-length') || 0);
    if (size > maxFileSize) throw new Error('FILE_TOO_LARGE');
    res.setHeader('Content-Type', source.contentType || upstream.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${(source.filename || 'download').replace(/[^a-z0-9._-]/gi, '_')}"`);
    if (size) res.setHeader('Content-Length', size);
    const reader = upstream.body.getReader();
    const pump = async () => { const { done, value } = await reader.read(); if (done) return res.end(); res.write(value); return pump(); };
    await pump();
  } catch (error) { if (!res.headersSent) { const result = errorResponse(error); res.status(result.status).json(result.body); } }
  finally { releaseSlot(); }
});
app.post('/api/media/cancel', (_req, res) => res.json({ success: true }));

app.use('/api', (_req, res) => res.status(404).json({
  success: false,
  error: 'API route not found',
  message: 'The requested API endpoint does not exist.'
}));
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html')));
app.use((error, req, res, next) => {
  console.error('MediaDrop server error:', {
    message: error?.message,
    stack: error?.stack,
    method: req.method,
    path: req.path
  });

  if (res.headersSent) return next(error);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({
      success: false,
      error: 'Service unavailable',
      message: 'MediaDrop encountered an internal server error. Please try again.'
    });
  }
  res.status(500).send('MediaDrop server error');
});
const server = app.listen(port, host, () => {
  console.log(`MediaDrop running on ${host}:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  server.closeAllConnections?.();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
