const { createProvider } = require('../_yt-dlp');

const videoProvider = createProvider('facebook', (url) => /(?:facebook\.com|fb\.watch)/i.test(url));

async function getPhotoInfo(url) {
	if (!/[?&]fbid=|\/photo(?:\/|\?)/i.test(url)) return videoProvider.getMediaInfo(url);
	const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
	if (!response.ok) throw new Error('PROVIDER_UNAVAILABLE');
	const html = await response.text();
	const imageUrl = readMeta(html, 'og:image') || readMeta(html, 'twitter:image');
	if (!imageUrl) throw new Error('PHOTO_UNAVAILABLE');
	const title = readMeta(html, 'og:title') || 'Facebook photo';
	let size = 'Size unavailable';
	try {
		const imageResponse = await fetch(imageUrl, { method: 'HEAD', redirect: 'follow' });
		const contentLength = Number(imageResponse.headers.get('content-length') || 0);
		if (imageResponse.ok && contentLength > 0) size = formatBytes(contentLength);
	} catch {}
	return { platform: 'facebook', type: 'image', title, thumbnail: imageUrl, preview: imageUrl, duration: null, formats: [{ id: 'facebook-image', quality: 'Original', extension: 'jpg', size, mimeType: 'image/jpeg', url: imageUrl }] };
}

async function download(url, formatId) {
	if (formatId === 'facebook-image') {
		const info = await getPhotoInfo(url);
		return { url: info.preview, contentType: info.formats[0].mimeType, filename: 'mediadrop-facebook-photo.jpg' };
	}
	return videoProvider.download(url, formatId);
}

async function getPreview(url, formatId) {
	const info = await getPhotoInfo(url);
	if (formatId === 'facebook-image') return { url: info.preview, contentType: info.formats[0].mimeType };
	return videoProvider.getPreview(url, formatId);
}

function readMeta(html, property) {
	const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
	const alternate = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i');
	return (html.match(pattern) || html.match(alternate))?.[1] || null;
}

function formatBytes(bytes) {
	return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

module.exports = { ...videoProvider, getMediaInfo: getPhotoInfo, getPreview, download };
