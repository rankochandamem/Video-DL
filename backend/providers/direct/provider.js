const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function detect(url) {
  try {
    const parsed = new URL(url);
    return /\.(mp4|webm|mov)(?:$|\?)/i.test(parsed.pathname) || /\.(jpe?g|png|webp|gif)(?:$|\?)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function getMediaInfo(url, context) {
  let response = await context.fetchWithTimeout(url, { method: 'HEAD' });
  if (!response.ok) response = await context.fetchWithTimeout(url, { headers: { Range: 'bytes=0-0' } });
  if (!response.ok) throw new Error('MEDIA_UNAVAILABLE');
  const contentType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (!VIDEO_TYPES.has(contentType) && !IMAGE_TYPES.has(contentType)) throw new Error('MEDIA_UNAVAILABLE');
  if (contentLength > context.maxFileSize) throw new Error('FILE_TOO_LARGE');

  const isVideo = VIDEO_TYPES.has(contentType);
  const extension = contentType === 'video/quicktime' ? 'mov' : contentType.split('/')[1];
  const title = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'Media file').replace(/[-_]+/g, ' ');
  return {
    platform: 'direct', type: isVideo ? 'video' : 'image', title,
    thumbnail: isVideo ? null : url, preview: isVideo && contentType !== 'video/quicktime' ? url : (!isVideo ? url : null),
    duration: null,
    formats: [{ id: `direct-${extension}`, quality: 'Original', extension, size: contentLength ? formatBytes(contentLength) : 'Size unavailable', mimeType: contentType }]
  };
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

module.exports = { name: 'direct', detect, getMediaInfo };
