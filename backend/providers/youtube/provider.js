const ytdlp = require('youtube-dl-exec');
const ffmpegPath = require('ffmpeg-static');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
const detect = (url) => /(?:youtube\.com|youtu\.be)/i.test(url);
const runtimeBinary = process.platform === 'win32' ? 'C:\\mediadrop-runtime\\yt-dlp.exe' : ytdlp.constants.YOUTUBE_DL_PATH;
if (process.platform === 'win32' && !fs.existsSync(runtimeBinary)) {
	fs.mkdirSync(path.dirname(runtimeBinary), { recursive: true });
	fs.copyFileSync(ytdlp.constants.YOUTUBE_DL_PATH, runtimeBinary);
}
const extractor = process.platform === 'win32' ? ytdlp.create(runtimeBinary) : ytdlp;

function availableFormats(info) {
	const bestAudio = (info.formats || [])
		.filter((format) => format.url && format.protocol === 'https' && format.vcodec === 'none' && format.acodec !== 'none')
		.sort((left, right) => Number(right.abr || 0) - Number(left.abr || 0))[0];
	return (info.formats || [])
		.filter((format) => format.url && format.protocol === 'https' && format.vcodec !== 'none' && ['mp4', 'webm'].includes(format.ext))
		.map((format) => ({
			id: `youtube-${format.format_id}`, quality: `${format.resolution || format.format_note || 'Original'}${ffmpegPath && format.acodec === 'none' ? '' : format.acodec === 'none' ? ' (video only)' : ''}`,
			extension: format.ext, size: Number(format.filesize || format.filesize_approx || 0) + (format.acodec === 'none' ? Number(bestAudio?.filesize || bestAudio?.filesize_approx || 0) : 0) > 0 ? formatBytes(Number(format.filesize || format.filesize_approx || 0) + (format.acodec === 'none' ? Number(bestAudio?.filesize || bestAudio?.filesize_approx || 0) : 0)) : 'Size unavailable',
			mimeType: format.mime_type || `video/${format.ext}`, url: format.url, hasAudio: format.acodec !== 'none'
		}))
		.sort((left, right) => parseQuality(right.quality) - parseQuality(left.quality));
}

async function loadInfo(url) {
	try {
		return await extractor(url, { dumpSingleJson: true, noWarnings: true, noPlaylist: true, skipDownload: true });
	} catch {
		throw new Error('PROVIDER_UNAVAILABLE');
	}
}

function getCaptionSource(info) {
	const captionGroups = { ...(info.automatic_captions || {}), ...(info.subtitles || {}) };
	const preferredLanguages = ['en', 'en-US', 'en-GB', 'en-CA'];
	const entries = Object.entries(captionGroups).flatMap(([language, captions]) => (Array.isArray(captions) ? captions.map((caption) => ({ language, ...caption })) : []));
	const chosen = entries.find((entry) => preferredLanguages.includes(entry.language) && entry.url)
		|| entries.find((entry) => entry.url)
		|| null;
	return chosen;
}

async function getTranscript(url) {
	const info = await loadInfo(url);
	const caption = getCaptionSource(info);
	if (!caption || !caption.url) throw new Error('MEDIA_UNAVAILABLE');
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 15000);
	try {
		const response = await fetch(caption.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: controller.signal });
		if (!response.ok) throw new Error('MEDIA_UNAVAILABLE');
		const raw = await response.text();
		const text = normalizeTranscript(raw, caption.ext || 'vtt');
		return { text, filename: `${getVideoId(url)}.txt` };
	} finally { clearTimeout(timer); }
}

function normalizeTranscript(raw, extension) {
	const normalized = raw.replace(/\r/g, '');
	if (extension === 'json3' || /^\s*\{/.test(normalized.trim())) {
		try {
			const parsed = JSON.parse(normalized);
			if (parsed && Array.isArray(parsed.events)) {
				return parsed.events
					.map((event) => {
						const chunks = Array.isArray(event.segs) ? event.segs : [];
						const text = chunks
							.map((seg) => seg && typeof seg.utf8 === 'string' ? seg.utf8 : '')
							.join('')
							.replace(/\n+/g, ' ')
							.replace(/\s+/g, ' ')
							.trim();
						if (!text) return null;
						return `${formatCueTimestamp((Number(event.tStartMs) || 0) / 1000)} ${text}`;
					})
					.filter(Boolean)
					.join('\n\n')
					.trim();
			}
		} catch {
			// Fall through to the legacy plain-text parser below.
		}
	}

	let text = normalized;
	if (/\<\/?[a-z][^>]*\>/i.test(normalized)) {
		text = normalized
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<[^>]+>/g, '\n')
			.replace(/&nbsp;/gi, ' ')
			.replace(/&amp;/gi, '&')
			.replace(/&lt;/gi, '<')
			.replace(/&gt;/gi, '>')
			.replace(/&quot;/gi, '"')
			.replace(/&#39;/gi, "'");
	}
	const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
	const output = [];
	let cueStart = null;
	let cueText = [];

	const flushCue = () => {
		if (cueStart === null || !cueText.length) return;
		const serial = cueText.map((entry) => entry.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
		if (serial) output.push(`${formatCueTimestamp(cueStart)} ${serial}`);
		cueStart = null;
		cueText = [];
	};

	for (const line of lines) {
		if (/^(WEBVTT|NOTE|STYLE|REGION|Kind:|Language:)/i.test(line)) continue;
		if (/^\d+$/.test(line)) continue;
		if (isCueTimestamp(line)) {
			flushCue();
			cueStart = parseCueTimestamp(line);
			continue;
		}
		if (/^\[[^\]]+\]$/.test(line)) continue;
		if (line.startsWith('<') && line.endsWith('>')) continue;
		if (cueStart !== null) {
			const cleaned = line.replace(/^[-•]\s*/, '').replace(/\s+/g, ' ').trim();
			if (cleaned) cueText.push(cleaned);
			continue;
		}
		output.push(line);
	}
	flushCue();
	return output.join('\n\n').trim();
}

function isCueTimestamp(line) {
	return /^\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}$/i.test(line)
		|| /^\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*\d{1,2}:\d{2}[.,]\d{1,3}$/i.test(line);
}

function parseCueTimestamp(line) {
	const start = line.split(/\s*-->\s*/i)[0];
	const [hours = '0', minutes = '0', seconds = '0', milliseconds = '0'] = start.split(/[:.]/);
	return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + (Number(milliseconds) || 0) / 1000;
}

function formatCueTimestamp(seconds) {
	const total = Math.max(0, Number(seconds) || 0);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const secs = Math.floor(total % 60);
	if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
	return `${minutes}:${String(secs).padStart(2, '0')}`;
}

async function getMediaInfo(url) {
	const info = await loadInfo(url);
	const formats = availableFormats(info);
	const transcript = getCaptionSource(info);
	if (!formats.length) throw new Error('PROVIDER_UNAVAILABLE');
	if (ffmpegPath) formats.push({ id: 'youtube-mp3', quality: 'Audio only', extension: 'mp3', size: 'Size calculated during conversion', mimeType: 'audio/mpeg' });
	return {
		platform: 'youtube', type: 'video', title: info.title || 'YouTube video',
		thumbnail: info.thumbnail || null, preview: `/api/media/preview?url=${encodeURIComponent(url)}&formatId=${encodeURIComponent((formats.find((format) => /x360|x240|x144/.test(format.quality)) || formats.at(-1)).id)}`,
		duration: info.duration || null, formats, transcriptAvailable: Boolean(transcript), transcriptLanguage: transcript?.language || null
	};
}

async function download(url, formatId) {
	if (formatId === 'youtube-mp3') {
		if (!ffmpegPath) throw new Error('PROVIDER_UNAVAILABLE');
		const outputPath = path.join(os.tmpdir(), `mediadrop-${crypto.randomBytes(12).toString('hex')}.mp3`);
		try {
			await extractor.exec(url, { extractAudio: true, audioFormat: 'mp3', audioQuality: '0', output: outputPath, ffmpegLocation: ffmpegPath, noPlaylist: true, noWarnings: true }, { shell: false });
			return { filePath: outputPath, contentType: 'audio/mpeg', filename: `mediadrop-${getVideoId(url)}.mp3` };
		} catch {
			throw new Error('PROVIDER_UNAVAILABLE');
		}
	}
	const info = await loadInfo(url);
	const format = availableFormats(info).find((item) => item.id === formatId);
	if (!format) throw new Error('MEDIA_UNAVAILABLE');
	if (format.hasAudio) return { url: format.url, contentType: format.mimeType, filename: `mediadrop-${info.id}.${format.extension}` };
	if (ffmpegPath && formatId.startsWith('youtube-')) {
		const outputPath = path.join(os.tmpdir(), `mediadrop-${crypto.randomBytes(12).toString('hex')}.mp4`);
		try {
			await extractor.exec(url, { format: `${formatId.slice(8)}+bestaudio/best`, output: outputPath, mergeOutputFormat: 'mp4', ffmpegLocation: ffmpegPath, noPlaylist: true, noWarnings: true }, { shell: false });
			return { filePath: outputPath, contentType: 'video/mp4', filename: `mediadrop-${info.id}.mp4` };
		} catch {
			throw new Error('PROVIDER_UNAVAILABLE');
		}
	}
	return { url: format.url, contentType: format.mimeType, filename: `mediadrop-${info.id}.${format.extension}` };
}

async function getPreview(url, formatId) {
	const info = await loadInfo(url);
	const format = availableFormats(info).find((item) => item.id === formatId) || availableFormats(info).at(-1);
	if (!format) throw new Error('MEDIA_UNAVAILABLE');
	return { url: format.url, contentType: format.mimeType };
}

function getVideoId(url) {
	const parsed = new URL(url);
	return parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v') || 'video';
}

function parseQuality(value) { return Number.parseInt(value, 10) || 0; }
function formatBytes(bytes) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

module.exports = { name: 'youtube', detect, getMediaInfo, getPreview, getTranscript, download };
