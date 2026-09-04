const { createProvider } = require('../_yt-dlp');
const { chromium } = require('playwright-core');
const fs = require('fs');

const videoProvider = createProvider('tiktok', (url) => /tiktok\.com/i.test(url));
const chromePath = process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : null;

async function getMediaInfo(url) {
	if (/\/photo\//i.test(url)) return getPhotoInfo(url);
	try {
		return await videoProvider.getMediaInfo(url);
	} catch {
		try {
			const response = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
			if (!response.ok) throw new Error('PROVIDER_UNAVAILABLE');
			const metadata = await response.json();
			return {
				platform: 'tiktok', type: 'video', title: metadata.title || 'TikTok video',
				thumbnail: metadata.thumbnail_url || null, preview: null, duration: null, formats: []
			};
		} catch {
			throw new Error('PROVIDER_UNAVAILABLE');
		}
	}
}

async function getPhotoInfo(url) {
	try {
		let html = '';
		try {
			const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
			if (response.ok) html = await response.text();
		} catch {}
		let images = findPhotoImages(html);
		if (!images.length) images = await findPhotoImagesInBrowser(url);
		if (!images.length) throw new Error('PROVIDER_UNAVAILABLE');
		const title = readMeta(html, 'og:title') || 'TikTok photo';
		return {
			platform: 'tiktok', type: 'image', title, thumbnail: images[0], preview: images[0], duration: null,
			formats: images.map((image, index) => ({ id: `tiktok-image-${index}`, quality: images.length > 1 ? `Image ${index + 1}` : 'Original', extension: 'jpg', size: 'Size unavailable', mimeType: 'image/jpeg', url: image }))
		};
	} catch {
		throw new Error('PROVIDER_UNAVAILABLE');
	}
}

async function findPhotoImagesInBrowser(url) {
	if (chromePath && !fs.existsSync(chromePath)) return [];
	let browser;
	try {
		browser = await chromium.launch({ headless: true, executablePath: chromePath || undefined });
		const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36' });
		await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
		await page.waitForTimeout(15000);
		return await page.locator('img').evaluateAll((images) => images.map((image) => image.currentSrc || image.src).filter((image) => /tiktokcdn.*\.(?:jpeg|jpg|png|webp|avif)/i.test(image)));
	} catch {
		return [];
	} finally {
		if (browser) await browser.close().catch(() => {});
	}
}

async function download(url, formatId) {
	if (!formatId?.startsWith('tiktok-image-')) return videoProvider.download(url, formatId);
	const info = await getPhotoInfo(url);
	const index = Number(formatId.slice('tiktok-image-'.length));
	const image = info.formats[index]?.url;
	if (!image) throw new Error('MEDIA_UNAVAILABLE');
	return { url: image, contentType: 'image/jpeg', filename: `mediadrop-tiktok-photo-${index + 1}.jpg` };
}

async function getPreview(url, formatId) {
	if (!formatId?.startsWith('tiktok-image-')) return videoProvider.getPreview(url, formatId);
	const info = await getPhotoInfo(url);
	const index = Number(formatId.slice('tiktok-image-'.length));
	const image = info.formats[index]?.url;
	if (!image) throw new Error('MEDIA_UNAVAILABLE');
	return { url: image, contentType: 'image/jpeg' };
}

function findPhotoImages(html) {
	const imageUrls = [];
	const htmlImagePattern = /https?:\\?\/\\?\/[^"'\s<>]+?(?:\.jpeg|\.jpg|\.png|\.webp|\.avif)(?:\?[^"'\s<>]*)?/gi;
	for (const match of html.match(htmlImagePattern) || []) imageUrls.push(match.replace(/\\\//g, '/').replace(/&amp;/g, '&'));
	const scriptPattern = /<script[^>]+id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/script>/gi;
	let match;
	while ((match = scriptPattern.exec(html))) {
		if (!/UNIVERSAL_DATA|SIGI_STATE|__NEXT_DATA__/i.test(match[1])) continue;
		try { collectImageUrls(JSON.parse(match[2]), imageUrls); } catch {}
	}
	const metaImage = readMeta(html, 'og:image');
	if (metaImage) imageUrls.push(metaImage);
	return [...new Set(imageUrls.filter((url) => /^https?:\/\//i.test(url)))];
}

function collectImageUrls(value, results) {
	if (!value || typeof value !== 'object') return;
	if (Array.isArray(value)) return value.forEach((entry) => collectImageUrls(entry, results));
	if (value.imagePost?.images) {
		for (const image of value.imagePost.images) {
			const urls = image.imageURL?.urlList || image.urlList || [];
			if (urls[0]) results.push(urls[0]);
		}
	}
	Object.values(value).forEach((entry) => collectImageUrls(entry, results));
}

function readMeta(html, property) {
	const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)`, 'i');
	const alternate = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i');
	return (html.match(pattern) || html.match(alternate))?.[1] || null;
}

module.exports = { ...videoProvider, getMediaInfo, download, getPreview };
