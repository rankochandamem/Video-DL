const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '' : window.location.origin;

const form = document.querySelector('#download-form');
const input = document.querySelector('#media-url');
const pasteButton = document.querySelector('#paste-button');
const clearButton = document.querySelector('#clear-button');
const resultSection = document.querySelector('#result-section');
const processing = document.querySelector('#processing');
const processingTitle = document.querySelector('#processing-title');
const result = document.querySelector('#result');
const formError = document.querySelector('#form-error');
const themeToggle = document.querySelector('#theme-toggle');
const platformHint = document.querySelector('#platform-hint');
const queueButton = document.querySelector('#queue-button');
const queueList = document.querySelector('#queue-list');
const queueCount = document.querySelector('#queue-count');
const clearQueueButton = document.querySelector('#clear-queue');
const historyList = document.querySelector('#history-list');
const clearHistoryButton = document.querySelector('#clear-history');
const featureModal = document.querySelector('#feature-modal');
const featureModalBody = document.querySelector('#feature-modal-body');
const featureModalTitle = document.querySelector('#feature-modal-title');
const featureModalKicker = document.querySelector('#feature-modal-kicker');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
      await Promise.all(registrations.map((registration) => registration.unregister().catch(() => {})));
      return;
    }
    navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' }).catch(() => {});
  });
}

const platformNames = { direct: 'Direct media', youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', twitter: 'X / Twitter', tiktok: 'TikTok' };

const themeIcon = themeToggle.querySelector('.theme-icon');
if (localStorage.getItem('mediadrop-theme') === 'dark') document.documentElement.dataset.theme = 'dark';
themeToggle.addEventListener('click', openThemeStudio);
if (document.documentElement.dataset.theme === 'dark') themeIcon.textContent = '☾';
document.querySelector('#qr-button').addEventListener('click', () => openShareTool('QR / continue on phone'));
document.querySelector('#locker-button').addEventListener('click', openLibrarySearch);
document.querySelector('#stats-button').addEventListener('click', openStats);
document.querySelector('#feature-close').addEventListener('click', closeFeatureModal);
featureModal.addEventListener('click', (event) => { if (event.target === featureModal) closeFeatureModal(); });
const directMediaCard = document.querySelector('.direct-card');
directMediaCard.addEventListener('click', openDirectMediaExamples);
directMediaCard.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDirectMediaExamples(); } });
const tiktokCard = document.querySelector('.platform-card.unavailable');
tiktokCard.addEventListener('click', openTikTokUnavailable);
tiktokCard.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openTikTokUnavailable(); } });
document.querySelectorAll('.platform-info-card').forEach((card) => {
  card.addEventListener('click', () => openPlatformInfo(card.dataset.platform));
  card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPlatformInfo(card.dataset.platform); } });
});

pasteButton.addEventListener('click', async () => {
  try {
    const pasted = await navigator.clipboard.readText();
    input.value = pasted;
    updatePlatformHint(pasted.trim());
    input.focus();
  } catch {
    input.focus();
  }
});
clearButton.addEventListener('click', () => { input.value = ''; formError.textContent = ''; updatePlatformHint(''); input.focus(); });
input.addEventListener('input', () => updatePlatformHint(input.value.trim()));
['dragenter', 'dragover'].forEach((eventName) => input.addEventListener(eventName, (event) => { event.preventDefault(); input.closest('.input-wrap').classList.add('drop-ready'); }));
['dragleave', 'drop'].forEach((eventName) => input.addEventListener(eventName, (event) => { event.preventDefault(); input.closest('.input-wrap').classList.remove('drop-ready'); }));
input.addEventListener('drop', (event) => { const dropped = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain'); if (dropped) { input.value = dropped.trim(); updatePlatformHint(input.value); } });
queueButton.addEventListener('click', () => addToQueue(input.value.trim()));
clearQueueButton.addEventListener('click', () => { localStorage.removeItem('mediadrop-queue'); renderQueue(); });
clearHistoryButton.addEventListener('click', () => { localStorage.removeItem('mediadrop-history'); renderHistory(); });
renderQueue(); renderHistory(); updatePlatformHint('');
renderFeatureCounts();
checkConnection();
setInterval(checkConnection, 10000);
window.addEventListener('online', checkConnection);
window.addEventListener('offline', () => { document.querySelector('#connection-status').textContent = '● Offline'; document.querySelector('#connection-detail').textContent = 'Check your connection before analyzing media.'; });
setInterval(checkClipboard, 4000);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !featureModal.classList.contains('hidden')) closeFeatureModal(); if (event.ctrlKey && event.key.toLowerCase() === 'k') { event.preventDefault(); openCommandPalette(); } if (event.ctrlKey && event.key === 'Enter') { event.preventDefault(); form.requestSubmit(); } if (event.ctrlKey && event.key.toLowerCase() === 'd') { event.preventDefault(); document.querySelector('.download-format')?.click(); } if (event.ctrlKey && event.key.toLowerCase() === 'c' && event.shiftKey) { event.preventDefault(); copyText(input.value.trim(), { textContent: '' }); } });

const menuToggle = document.querySelector('#menu-toggle');
const navigation = document.querySelector('.desktop-nav');
menuToggle.addEventListener('click', () => {
  const isOpen = navigation.classList.toggle('mobile-open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});
navigation.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  navigation.classList.remove('mobile-open');
  menuToggle.setAttribute('aria-expanded', 'false');
}));

form.addEventListener('submit', async (event) => {
  event.preventDefault(); formError.textContent = ''; const url = input.value.trim();
  try { new URL(url); } catch { formError.textContent = 'Invalid link. Enter a complete http:// or https:// URL.'; input.focus(); return; }
  resultSection.classList.remove('hidden'); processing.classList.remove('hidden'); result.innerHTML = ''; setTimeline('Analyzing'); resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
  processingTitle.textContent = 'Checking URL health and source...';
  try {
    setTimeline('Finding media');
    const response = await fetch(`${API_BASE}/api/media/info`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    const data = await parseJsonResponse(response);
    if (!response.ok) throw data;
    setTimeline('Preparing');
    renderResult(data, url);
    saveHistory(data, url);
  } catch (error) { setTimeline('Unavailable'); renderError(error); }
  processing.classList.add('hidden');
});

function renderError(error) {
  const title = error.error || 'Something Went Wrong';
  const message = error.message || 'Please try again later.';
  const warningClass = /youtube/i.test(`${title} ${message}`) ? ' youtube-unavailable' : '';
  const suggestion = /invalid|url|link/i.test(`${title} ${message}`) ? 'Check that the URL is complete and publicly accessible.' : /blocked|private|restricted/i.test(`${title} ${message}`) ? 'Use a public link you are authorized to access. MediaDrop cannot bypass access controls.' : 'Try again, or choose another available format after the source responds.';
  result.innerHTML = `<div class="error-doctor${warningClass}"><div class="doctor-heading"><span class="doctor-icon">!</span><div><span class="panel-kicker">DOWNLOAD DOCTOR</span><h2>${escapeHtml(title)}</h2></div></div><div class="doctor-check"><span>Problem</span><strong>${escapeHtml(message)}</strong></div><div class="doctor-check"><span>Try this</span><strong>${escapeHtml(suggestion)}</strong></div><div class="doctor-actions"><button class="retry-link" type="button">Retry analysis</button><button class="new-link" type="button">New link</button></div></div>`;
  result.querySelector('.retry-link').addEventListener('click', () => form.requestSubmit());
  result.querySelector('.new-link').addEventListener('click', reset);
}
function renderResult(data, url) {
  const youtubeId = data.platform === 'youtube' ? getYouTubeId(url) : null;
  const tiktokId = data.platform === 'tiktok' ? getTikTokId(url) : null;
  const isFacebookVideo = data.platform === 'facebook' && data.type === 'video' && !data.preview;
  const embedOrigin = encodeURIComponent(window.location.origin);
  const preview = youtubeId ? `<iframe class="youtube-embed" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?origin=${embedOrigin}&enablejsapi=1&rel=0&modestbranding=1" title="${escapeAttr(data.title)}" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>` : tiktokId ? `<iframe class="youtube-embed" src="https://www.tiktok.com/player/v1/${encodeURIComponent(tiktokId)}?description=1&music_info=1&rel=0" title="${escapeAttr(data.title)}" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>` : isFacebookVideo ? `<iframe class="youtube-embed" src="https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=false" title="${escapeAttr(data.title)}" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>` : data.type === 'video' && data.preview ? `<video controls playsinline preload="metadata" poster="${escapeAttr(data.thumbnail || '')}" src="${escapeAttr(data.preview)}"></video>` : data.thumbnail ? `<div class="thumbnail-fallback"><img src="${escapeAttr(data.thumbnail)}" alt="${escapeAttr(data.title)}"><span>Preview unavailable</span></div>` : data.type === 'image' && data.preview ? `<img src="${escapeAttr(data.preview)}" alt="${escapeAttr(data.title)}">` : `<div class="preview-empty"><strong>Preview unavailable</strong><span>You can still download the available media below.</span></div>`;
  const availableFormats = data.formats || [];
  const formats = availableFormats.map((format) => `<div class="format-row"><div><strong>${escapeHtml(format.quality)} ${escapeHtml(format.extension.toUpperCase())}</strong><small class="format-size">${escapeHtml(format.size)}</small></div><div class="format-action"><div class="download-progress-row hidden"><span class="result-label">DOWNLOAD PROGRESS</span><div class="progress-track"><div class="progress-bar"></div></div><small class="progress-copy">Starting secure stream...</small></div><button class="download-format" data-id="${escapeAttr(format.id)}">Download ↗</button></div></div>`).join('');
  const transcriptButton = data.transcriptAvailable ? `<div class="format-row transcript-row"><div class="transcript-copy"><strong>Transcript</strong></div><button class="download-transcript" type="button">Download ↗</button></div>` : '';
  const formatLabels = [...new Set([...(data.formats || []).map((format) => format.extension.toUpperCase()), ...(data.transcriptAvailable ? ['Transcript'] : [])])];
  const formatSummary = formatLabels.length ? (formatLabels.length === 1 ? formatLabels[0] : `${formatLabels.slice(0, -1).join(', ')} & ${formatLabels[formatLabels.length - 1]}`) : 'No options';
  const sourceIcon = data.platform === 'youtube' ? '<span class="youtube-source-icon" role="img" aria-label="YouTube logo"><span>▶</span></span>' : '<span class="source-icon">↗</span>';
  const details = [['Resolution', data.resolution], ['Aspect ratio', data.aspectRatio], ['Duration', formatMediaDuration(data.duration)], ['File type', data.format || availableFormats[0]?.extension?.toUpperCase()], ['Video codec', data.videoCodec], ['Audio codec', data.audio], ['Frame rate', data.fps], ['Estimated size', data.size]].filter((item) => item[1]);
  const metadataText = details.map(([label, value]) => `${label}: ${value}`).join('\n');
  const detailsMarkup = details.length ? `<div class="media-details"><div class="details-heading"><span>MEDIA INSPECTOR</span><div><button class="copy-metadata" type="button" data-metadata="${escapeAttr(metadataText)}">Copy metadata</button><button class="favorite-button" type="button" aria-label="Save to favorites">☆</button></div></div>${details.map(([label, value]) => `<div class="detail-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div>` : '';
  const filenameTool = '<div class="filename-tool"><label for="smart-filename">FILENAME (Optional)</label><input id="smart-filename" type="text" value="" placeholder="Enter filename"><small>Leave blank to use the source filename.</small></div>';
  result.innerHTML = `<div class="media-preview">${data.thumbnail ? `<div class="media-backdrop" style="--media-image:url('${escapeAttr(data.thumbnail)}')"></div>` : ''}<div class="preview-frame">${preview}</div><div class="source-meta"><div class="source-title">${escapeHtml(data.title)}</div><div class="source-platform">${sourceIcon}${escapeHtml(platformNames[data.platform] || data.platform)}<span class="source-menu">⋮</span></div></div>${detailsMarkup}<div class="result-tools"><button type="button" class="tool-chip" data-tool="share">▦ QR / phone</button><button type="button" class="tool-chip" data-tool="private">↗ Private link</button></div></div><div class="format-panel"><div class="result-header"><h2 class="result-title">Download options</h2><span class="result-format-summary">${escapeHtml(formatSummary)}</span></div>${filenameTool}<div>${formats || '<p class="status-message">No downloadable formats were returned.</p>'}</div>${transcriptButton}</div>`;
  const previousItem = getStoredList('mediadrop-history').find((item) => item.url === url);
  if (previousItem) {
    const currentFormat = data.format || availableFormats[0]?.extension?.toUpperCase() || 'Media';
    const currentSize = data.size || availableFormats[0]?.size || 'Size unavailable';
    const mediaLabel = `${String(data.type || 'media').replace(/^./, (character) => character.toUpperCase())} · ${currentFormat}`;
    result.querySelector('.format-panel').insertAdjacentHTML('afterbegin', `<div class="duplicate-warning"><strong>Possible duplicate</strong><span>This media was analyzed before.</span><small>${escapeHtml(mediaLabel)} · ${escapeHtml(currentSize)}</small></div>`);
  }
  if (youtubeId && data.thumbnail && window.matchMedia('(max-width: 800px)').matches) result.querySelector('.preview-frame').innerHTML = `<a class="mobile-source-preview" href="${escapeAttr(url)}" target="_blank" rel="noreferrer"><img src="${escapeAttr(data.thumbnail)}" alt="${escapeAttr(data.title)}"><span>Open on YouTube ↗</span></a>`;
  result.querySelector('.media-preview').style.setProperty('--media-image', data.thumbnail ? `url("${data.thumbnail}")` : 'none');
  const favoriteButton = result.querySelector('.favorite-button');
  if (favoriteButton) { favoriteButton.addEventListener('click', () => toggleFavorite(url, data, favoriteButton)); updateFavoriteButton(url, favoriteButton); }
  const previewVideo = result.querySelector('.preview-frame video');
  if (previewVideo) {
    const enableAudio = () => { previewVideo.muted = false; previewVideo.volume = 1; };
    previewVideo.addEventListener('loadedmetadata', enableAudio, { once: true });
    enableAudio();
  }
  result.querySelector('.copy-metadata')?.addEventListener('click', (event) => copyText(event.currentTarget.dataset.metadata, event.currentTarget));
  result.querySelectorAll('.download-format').forEach((button) => { button.onclick = () => downloadMedia(url, button.dataset.id, button); });
  result.querySelector('.recommendation-button')?.addEventListener('click', (event) => {
    const target = result.querySelector(`.download-format[data-id="${CSS.escape(event.currentTarget.dataset.recommendationId)}"]`);
    if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); target.focus(); target.click(); }
  });
  result.querySelectorAll('.preset-button').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.preset === 'transcript') {
      const transcriptAction = result.querySelector('.download-transcript');
      if (transcriptAction) {
        const transcriptRow = transcriptAction.closest('.transcript-row');
        transcriptRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        transcriptAction.focus();
      }
      return;
    }
    const selected = choosePresetFormat(availableFormats, button.dataset.preset);
    if (!selected) return;
    const formatButton = result.querySelector(`.download-format[data-id="${CSS.escape(selected.id)}"]`);
    if (formatButton) { formatButton.scrollIntoView({ behavior: 'smooth', block: 'center' }); formatButton.focus(); }
  }));
  const transcriptButtonNode = result.querySelector('.download-transcript');
  if (transcriptButtonNode) transcriptButtonNode.addEventListener('click', () => downloadTranscript(url));
  result.querySelectorAll('.tool-chip').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.tool === 'share') openShareTool('QR / continue on phone', url, data.title);
    if (button.dataset.tool === 'private') openPrivateLink(url, data.title);
  }));
  const newLinkNode = result.querySelector('.new-link');
  if (newLinkNode) newLinkNode.addEventListener('click', reset);
}

async function downloadTranscript(url) {
  try {
    const response = await fetch(`${API_BASE}/api/media/transcript`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    if (!response.ok) throw await parseJsonResponse(response);
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = match ? decodeURIComponent(match[1]) : 'transcript.txt';
    link.click();
    URL.revokeObjectURL(link.href);
    incrementStats(0, 'transcript');
  } catch (error) {
    formError.textContent = error.error || error.message || 'Transcript is unavailable for this link.';
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

async function downloadMedia(url, formatId, button) {
  button.disabled = false; button.textContent = 'Cancel'; button.classList.add('download-cancel-active'); const row = button.closest('.format-row'); const controller = new AbortController(); const progress = row.querySelector('.download-progress-row'); button.onclick = () => { progress.classList.add('hidden'); setTimeline('Canceled'); showDownloadCanceled(); controller.abort(); }; progress.classList.remove('hidden'); progress.style.flexBasis = '100%'; progress.style.marginTop = '0'; progress.querySelector('.progress-bar').style.width = '0'; progress.querySelector('.progress-copy').textContent = 'Starting secure stream...';
  setTimeline('Downloading');
  try {
    const response = await fetch(`${API_BASE}/api/media/download`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, formatId }), signal: controller.signal });
    if (!response.ok) throw await parseJsonResponse(response);
    const total = Number(response.headers.get('content-length')) || 0;
    if (total) row.querySelector('.format-size').textContent = formatBytes(total);
    let loaded = 0;
    const startedAt = performance.now();
    const chunks = [];
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      const percent = total ? Math.round(loaded / total * 100) : 0;
      progress.querySelector('.progress-bar').style.width = `${percent}%`;
      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.1);
      const speed = loaded / elapsedSeconds;
      const eta = total && speed > 0 ? formatDuration((total - loaded) / speed) : null;
      progress.querySelector('.progress-copy').textContent = total ? `${percent}% · ${formatBytes(speed)}/s${eta ? ` · ${eta} left` : ''}` : `${formatBytes(loaded)} downloaded · ${formatBytes(speed)}/s`;
    }
    const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const extension = response.headers.get('content-type')?.split('/')[1]?.split(';')[0] || 'mp4';
    link.download = buildFilename(document.querySelector('#smart-filename')?.value, dataTitleFromResult(), extension, url);
    link.click();
    URL.revokeObjectURL(link.href);
    progress.querySelector('.progress-copy').textContent = '✓ Download complete';
    saveLockerItem({ title: dataTitleFromResult(), size: total || loaded, url, time: Date.now() });
    const downloadedType = formatId === 'social-mp3' ? 'audio' : (document.querySelector('.source-platform')?.textContent.includes('Image') ? 'image' : 'video');
    incrementStats(total || loaded, downloadedType);
    setTimeline('Complete');
    notifyDownload(); playCompletionSound();
    button.textContent = 'Download again ↗';
    button.classList.remove('download-cancel-active');
    button.onclick = () => confirmDownloadAgain(url, formatId, button);
  } catch (error) {
    if (error.name === 'AbortError') progress.classList.add('hidden');
    else progress.querySelector('.progress-copy').textContent = error.error || error.message || 'Download unavailable';
    button.textContent = error.name === 'AbortError' ? 'Download ↗' : 'Try again ↗';
    button.classList.remove('download-cancel-active');
    button.onclick = error.name === 'AbortError' ? () => downloadMedia(url, formatId, button) : () => confirmDownloadAgain(url, formatId, button);
  }
}
function dataTitleFromResult() { return document.querySelector('.source-title')?.textContent || 'mediadrop-download'; }
function buildFilename(value, title, extension, url) {
  const fallback = (url.split('/').pop() || 'mediadrop-download').split('?')[0];
  const clean = String(value || title || fallback).trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, ' ').replace(/\.+$/, '');
  return `${clean || 'mediadrop-download'}.${extension.replace(/[^a-z0-9]/gi, '') || 'mp4'}`;
}
function captureFrame(container) {
  const video = container.querySelector('.preview-frame video');
  const status = container.querySelector('.frame-status');
  if (!video || !video.videoWidth) { status.textContent = 'Frame capture is available for direct video previews.'; return; }
  const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0); const link = document.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = `${buildFilename('', dataTitleFromResult(), 'png', '')}`; link.click(); status.textContent = 'Frame captured as PNG.';
}
function confirmDownloadAgain(url, formatId, button) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = '<div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">Download again?</h2><p>Do you want to download this file again?</p><div class="confirm-actions"><button class="confirm-cancel" type="button">Cancel</button><button class="confirm-accept" type="button">Download again ↗</button></div></div>';
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.confirm-cancel').addEventListener('click', close);
  overlay.querySelector('.confirm-accept').addEventListener('click', () => { close(); downloadMedia(url, formatId, button); });
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  overlay.querySelector('.confirm-cancel').focus();
}
function showDownloadCanceled() {
  const notice = document.createElement('div');
  notice.className = 'download-canceled-notice';
  notice.textContent = 'Download canceled';
  document.body.appendChild(notice);
  setTimeout(() => notice.remove(), 1800);
}
function updatePlatformHint(value) {
  if (!value) { platformHint.innerHTML = '<span class="hint-dot"></span><span>Paste a link to detect its platform</span>'; return; }
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, '');
    const platform = Object.entries({ youtube: 'YouTube', youtu: 'YouTube', instagram: 'Instagram', facebook: 'Facebook', x: 'X / Twitter', twitter: 'X / Twitter', tiktok: 'TikTok' }).find(([key]) => hostname.includes(key));
    const label = platform ? `${platform[1]} detected` : 'Direct media link detected';
    platformHint.innerHTML = `<span class="hint-dot detected"></span><span>${escapeHtml(label)}</span>`;
  } catch { platformHint.innerHTML = '<span class="hint-dot"></span><span>Enter a complete public URL</span>'; }
}
function getStoredList(key) { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } }
function addToQueue(url) {
  try { new URL(url); } catch { formError.textContent = 'Enter a valid URL before adding it to the queue.'; input.focus(); return; }
  const queue = getStoredList('mediadrop-queue');
  if (!queue.includes(url)) queue.push(url);
  localStorage.setItem('mediadrop-queue', JSON.stringify(queue.slice(-20))); input.value = ''; updatePlatformHint(''); renderQueue();
}
function renderQueue() {
  const queue = getStoredList('mediadrop-queue'); queueCount.textContent = queue.length;
  queueList.innerHTML = queue.length ? queue.map((url, index) => `<div class="queue-item"><span class="queue-index">${String(index + 1).padStart(2, '0')}</span><span class="queue-url" title="${escapeAttr(url)}">${escapeHtml(url)}</span><button class="queue-open" type="button" data-url="${escapeAttr(url)}">Analyze</button><button class="queue-remove" type="button" aria-label="Remove queued link" data-index="${index}">×</button></div>`).join('') : '<p class="empty-state">Your queue is empty. Add links above to line them up.</p>';
  queueList.querySelectorAll('.queue-open').forEach((button) => button.addEventListener('click', () => {
    input.value = button.dataset.url;
    const remainingQueue = queue.filter((url) => url !== button.dataset.url);
    localStorage.setItem('mediadrop-queue', JSON.stringify(remainingQueue));
    renderQueue();
    updatePlatformHint(input.value);
    form.requestSubmit();
  }));
  queueList.querySelectorAll('.queue-remove').forEach((button) => button.addEventListener('click', () => { queue.splice(Number(button.dataset.index), 1); localStorage.setItem('mediadrop-queue', JSON.stringify(queue)); renderQueue(); }));
}
function saveHistory(data, url) {
  const history = getStoredList('mediadrop-history').filter((item) => item.url !== url);
  history.unshift({ url, title: data.title || 'Untitled media', platform: platformNames[data.platform] || data.platform, type: data.type || 'media', format: data.format || data.formats?.[0]?.extension?.toUpperCase() || '', size: data.size || data.formats?.[0]?.size || '', time: Date.now() });
  localStorage.setItem('mediadrop-history', JSON.stringify(history.slice(0, 8))); renderHistory();
}
function renderHistory() {
  const history = getStoredList('mediadrop-history');
  historyList.innerHTML = history.length ? history.map((item) => `<button class="history-item" type="button" data-url="${escapeAttr(item.url)}"><span class="history-type">${escapeHtml(item.type)}</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.platform)} · ${new Date(item.time).toLocaleDateString()}</small></span><span>↗</span></button>`).join('') : '<p class="empty-state">Analyzed links will appear here.</p>';
  historyList.querySelectorAll('.history-item').forEach((button) => button.addEventListener('click', () => { input.value = button.dataset.url; updatePlatformHint(input.value); form.requestSubmit(); }));
}
function toggleFavorite(url, data, button) {
  const favorites = getStoredList('mediadrop-favorites'); const index = favorites.findIndex((item) => item.url === url);
  if (index >= 0) favorites.splice(index, 1); else favorites.unshift({ url, title: data.title || 'Untitled media', platform: platformNames[data.platform] || data.platform });
  localStorage.setItem('mediadrop-favorites', JSON.stringify(favorites.slice(0, 20))); updateFavoriteButton(url, button);
}
function updateFavoriteButton(url, button) { button.textContent = getStoredList('mediadrop-favorites').some((item) => item.url === url) ? '★' : '☆'; button.setAttribute('aria-label', button.textContent === '★' ? 'Remove from favorites' : 'Save to favorites'); }
function reset() { input.value = ''; result.innerHTML = ''; resultSection.classList.add('hidden'); formError.textContent = ''; window.scrollTo({ top: 0, behavior: 'smooth' }); input.focus(); }
async function parseJsonResponse(response) {
  const body = await response.text();
  try { return JSON.parse(body); } catch {
    return {
      success: false,
      error: 'Service unavailable',
      message: response.ok
        ? 'The server returned an invalid response.'
        : `The server returned an unexpected response (${response.status}).`
    };
  }
}
function parseFormatSize(value) {
  const match = String(value || '').match(/([\d.]+)\s*(B|KB|MB|GB)/i);
  if (!match) return 0;
  const units = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
  return Number(match[1]) * (units[match[2].toLowerCase()] || 1);
}
function formatResolution(format) { return Number(String(format.quality).match(/(\d{3,4})p/i)?.[1] || 0); }
function choosePresetFormat(formats, preset) {
  const sorted = [...formats];
  const resolution = formatResolution;
  const size = (format) => parseFormatSize(format.size);
  if (preset === 'audio') return sorted.find((format) => /^(mp3|m4a|aac|wav|ogg|flac)$/i.test(format.extension));
  if (preset === 'small') return sorted.sort((left, right) => size(left) - size(right))[0];
  if (preset === 'mobile') return sorted.filter((format) => !resolution(format) || resolution(format) <= 720).sort((left, right) => resolution(right) - resolution(left))[0] || sorted[0];
  const compatible = sorted.filter((format) => /^(mp4|m4v)$/i.test(format.extension) && format.hasAudio !== false);
  if (preset === 'desktop') return sorted.sort((left, right) => resolution(right) - resolution(left) || size(left) - size(right))[0];
  if (preset === 'best') return sorted.sort((left, right) => ((right.hasAudio !== false) - (left.hasAudio !== false)) || (/^mp4$/i.test(right.extension) - /^mp4$/i.test(left.extension)) || resolution(right) - resolution(left) || size(left) - size(right))[0];
  return sorted.sort((left, right) => resolution(right) - resolution(left))[0];
}
function buildSizeEstimator(formats) {
  const entries = formats.map((format) => ({ ...format, pixels: formatResolution(format), bytes: parseFormatSize(format.size) })).filter((format) => format.pixels && format.bytes);
  if (!entries.length) return '<div class="size-estimator"><div><span class="panel-kicker">SIZE ESTIMATOR</span><strong>Source size</strong></div><p>Exact estimates are unavailable for this source. The download size will be reported as it streams.</p></div>';
  const byQuality = new Map();
  entries.forEach((format) => { if (!byQuality.has(format.pixels) || format.bytes < byQuality.get(format.pixels).bytes) byQuality.set(format.pixels, format); });
  const rows = [...byQuality.values()].sort((left, right) => left.pixels - right.pixels).map((format) => `<div><span>${format.pixels}p</span><strong>~${format.size}</strong></div>`).join('');
  return `<div class="size-estimator"><div><span class="panel-kicker">EXACT FILE SIZE</span><strong>Available quality estimates</strong></div><div class="size-estimator-grid">${rows}</div><small>Based on the source-provided file size. Approximate values can vary slightly.</small></div>`;
}
function buildRecommendation(formats) {
  const selected = choosePresetFormat(formats, 'best');
  if (!selected) return '';
  const quality = selected.quality || 'Original';
  const size = selected.size || 'Size unavailable';
  return `<div class="recommendation-panel"><div><span class="panel-kicker">MEDIADROP RECOMMENDATION</span><strong>★ ${escapeHtml(quality)} ${escapeHtml(String(selected.extension).toUpperCase())} <em>Best overall</em></strong><small>${escapeHtml(size)}${selected.hasAudio === false ? ' · video only' : ''}</small></div><button class="recommendation-button" type="button" data-recommendation-id="${escapeAttr(selected.id)}">Download recommended</button></div>`;
}
function formatClock(value) { const seconds = Number(value); if (!Number.isFinite(seconds)) return '--:--'; const minutes = Math.floor(seconds / 60); return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
function formatMediaDuration(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0 || String(value).includes(':')) return value;
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${minutes}:${String(remainder).padStart(2, '0')}`;
}
function formatBytes(bytes) { const value = Number(bytes) || 0; if (value < 1024) return `${Math.round(value)} B`; if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`; if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`; return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`; }
function formatDuration(seconds) { const rounded = Math.max(0, Math.ceil(seconds)); if (rounded < 60) return `${rounded}s`; const minutes = Math.floor(rounded / 60); const remainder = rounded % 60; return `${minutes}m ${String(remainder).padStart(2, '0')}s`; }
function notifyDownload() { if ('Notification' in window && Notification.permission === 'granted') new Notification('MediaDrop download complete', { body: 'Your media file is ready.' }); }
function playCompletionSound() { if (localStorage.getItem('mediadrop-sound') === 'off' || !window.AudioContext) return; const audio = new AudioContext(); const oscillator = audio.createOscillator(); const gain = audio.createGain(); oscillator.frequency.value = 740; gain.gain.setValueAtTime(.05, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .35); oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + .35); }
function setTimeline(stage) {
  const timeline = document.querySelector('.download-timeline');
  const timelineSteps = [...document.querySelectorAll('.download-timeline span')];
  if (!timeline || !timelineSteps.length) return;

  const stages = ['Analyzing', 'Finding media', 'Preparing', 'Downloading', 'Complete'];
  timelineSteps.forEach((step, index) => {
    const stepName = stages[index] || 'Complete';
    step.dataset.stage = stepName;

    if (stage === 'Canceled' && stepName === 'Downloading') {
      step.textContent = 'Canceled';
      return;
    }

    if (stepName === 'Finding media' && stage === 'Unavailable') {
      step.textContent = 'Unavailable';
      return;
    }

    if (stepName === 'Downloading') {
      step.textContent = stage === 'Downloading' ? 'Downloading' : stage === 'Complete' ? 'Downloaded' : 'Download';
      return;
    }

    if (stepName === 'Complete') {
      step.textContent = 'Complete';
      return;
    }

    step.textContent = stepName;
  });

  if (stage === 'Canceled') {
    timeline.classList.add('canceled');
    timelineSteps.forEach((step) => {
      const stepName = step.dataset.stage;
      step.classList.remove('active', 'done', 'error');
      if (['Analyzing', 'Finding media', 'Preparing'].includes(stepName)) {
        step.classList.add('done');
      } else if (stepName === 'Downloading') {
        step.classList.add('active', 'error');
        step.textContent = 'Canceled';
      }
    });
    return;
  }

  timeline.classList.toggle('canceled', false);
  if (stage === 'Unavailable') {
    timelineSteps.forEach((step) => {
      const stepName = step.dataset.stage;
      step.classList.remove('active', 'done', 'error');
      if (stepName === 'Analyzing') {
        step.classList.add('active');
        step.textContent = 'Analyzing';
      } else if (stepName === 'Finding media') {
        step.classList.add('active', 'error');
        step.textContent = 'Unavailable';
      }
    });
    return;
  }

  const finalLabel = stage === 'Canceled' ? 'Canceled' : 'Complete';
  const currentIndex = stages.indexOf(stage);
  timelineSteps.forEach((step) => {
    const stepName = step.dataset.stage;
    const stepIndex = stages.indexOf(stepName);
    step.classList.remove('active', 'done', 'error');
    if (stepIndex === currentIndex) step.classList.add('active');
    else if (stepIndex >= 0 && stepIndex < currentIndex) step.classList.add('done');
  });
  timelineSteps[timelineSteps.length - 1].textContent = finalLabel;
}
function checkClipboard() { if (document.activeElement === input || !navigator.clipboard?.readText) return; navigator.clipboard.readText().then((text) => { if (/^https?:\/\//i.test(text) && text !== input.value && !document.querySelector('.clipboard-toast')) { const toast = document.createElement('button'); toast.className = 'clipboard-toast'; toast.textContent = 'Clipboard URL detected · Analyze'; toast.onclick = () => { input.value = text; updatePlatformHint(text); toast.remove(); form.requestSubmit(); }; document.body.appendChild(toast); setTimeout(() => toast.remove(), 7000); } }).catch(() => {}); }
function openCommandPalette() {
  openFeatureModal('Command palette', 'KEYBOARD CONTROL', '<input class="command-search" id="command-search" placeholder="Search MediaDrop commands" autofocus><div class="command-list" id="command-list"></div>');
  const commands = [['Analyze URL', () => { closeFeatureModal(); input.focus(); }], ['Open media library', openLibrarySearch], ['Change theme', openThemeStudio]];
  const search = featureModalBody.querySelector('#command-search'); const list = featureModalBody.querySelector('#command-list');
  const render = () => { const query = search.value.toLowerCase(); list.innerHTML = commands.filter(([label]) => label.toLowerCase().includes(query)).map(([label], index) => `<button type="button" class="command-item" data-command-index="${index}"><span>↓</span><strong>${label}</strong></button>`).join('') || '<p class="empty-state">No matching commands.</p>'; list.querySelectorAll('.command-item').forEach((button) => button.onclick = () => commands[Number(button.dataset.commandIndex)][1]()); };
  search.addEventListener('input', render); render(); search.focus();
}
function openNetworkTool() { const connection = navigator.connection; const type = connection?.effectiveType || 'unknown'; const downlink = connection?.downlink ? `${connection.downlink} Mbps` : 'Not reported'; const recommendation = /slow-2g|2g/.test(type) ? '360p or the smallest available file' : /3g/.test(type) ? '480p or 720p' : '720p or higher'; openFeatureModal('Network optimizer', 'LIVE CONNECTION PROFILE', `<div class="network-tool"><div class="network-metrics"><strong>${type.toUpperCase()}</strong><span>${downlink} estimated downlink</span></div><p>Recommended: <strong>${recommendation}</strong></p><small>Recommendations use the browser Network Information API when available.</small></div>`); }
function openLibrarySearch() { openFeatureModal('Search your library', 'LOCAL MEDIA SEARCH', '<div class="library-toolbar"><div class="library-search-wrap"><input class="library-search" id="library-search" placeholder="Search title, platform, or type"><button class="library-search-clear" id="library-search-clear" type="button" aria-label="Clear search">×</button></div><button class="library-clear-all" id="library-clear-all" type="button">Clear</button></div><div id="library-results" class="library-results"></div>'); const search = featureModalBody.querySelector('#library-search'); const render = () => { const query = search.value.toLowerCase(); const items = getStoredList('mediadrop-history').filter((item) => `${item.title} ${item.platform} ${item.type}`.toLowerCase().includes(query)); featureModalBody.querySelector('#library-results').innerHTML = items.length ? items.map((item) => `<div class="library-result-row"><button type="button" class="library-result" data-url="${escapeAttr(item.url)}"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.platform)} · ${escapeHtml(item.type)}</small></button><button type="button" class="library-result-remove" data-url="${escapeAttr(item.url)}" aria-label="Remove media">×</button></div>`).join('') : '<p class="empty-state">No matching media found.</p>'; featureModalBody.querySelectorAll('.library-result').forEach((button) => button.onclick = () => { input.value = button.dataset.url; closeFeatureModal(); form.requestSubmit(); }); featureModalBody.querySelectorAll('.library-result-remove').forEach((button) => button.onclick = () => { const remaining = getStoredList('mediadrop-history').filter((item) => item.url !== button.dataset.url); localStorage.setItem('mediadrop-history', JSON.stringify(remaining)); renderHistory(); renderFeatureCounts(); render(); }); }; search.addEventListener('input', render); featureModalBody.querySelector('#library-search-clear').addEventListener('click', () => { search.value = ''; render(); search.focus(); }); featureModalBody.querySelector('#library-clear-all').addEventListener('click', () => { localStorage.removeItem('mediadrop-history'); renderHistory(); renderFeatureCounts(); render(); }); render(); }
function openAchievements() { const stats = JSON.parse(localStorage.getItem('mediadrop-stats') || '{"downloads":0,"types":{}}'); const rows = [['First download', stats.downloads >= 1], ['10 downloads', stats.downloads >= 10], ['100 downloads', stats.downloads >= 100], ['First video', (stats.types.video || 0) >= 1], ['First image', (stats.types.image || 0) >= 1]]; openFeatureModal('Achievements', 'PRIVATE MILESTONES', `<div class="achievement-list">${rows.map(([label, earned]) => `<div class="achievement-row ${earned ? 'earned' : ''}"><span>${earned ? '✓' : '○'}</span><strong>${label}</strong></div>`).join('')}</div>`); }
function openCalculators() { openFeatureModal('Mini calculators', 'QUICK TOOLS', '<div class="calculator-tool"><label>File size (MB)<input id="calc-size" type="number" min="0" value="50"></label><label>Download speed (Mbps)<input id="calc-speed" type="number" min="1" value="20"></label><strong id="calc-result">Approx. 20 seconds</strong></div>'); const update = () => { const size = Number(featureModalBody.querySelector('#calc-size').value) || 0; const speed = Number(featureModalBody.querySelector('#calc-speed').value) || 1; featureModalBody.querySelector('#calc-result').textContent = `Approx. ${formatDuration(size * 8 / speed)} at this speed`; }; featureModalBody.querySelectorAll('input').forEach((inputField) => inputField.addEventListener('input', update)); }
function openDirectMediaExamples() {
  openFeatureModal('Direct media examples', 'SUPPORTED FILE TYPES', '<div class="media-examples"><div class="media-example"><span class="media-example-icon video">MP4</span><div><strong>MP4 video</strong><small>Video files from a direct public link</small></div></div><div class="media-example"><span class="media-example-icon image">JPG</span><div><strong>JPG image</strong><small>Images from a direct public link</small></div></div><div class="media-example"><span class="media-example-icon image">PNG</span><div><strong>PNG image</strong><small>Transparent and standard images</small></div></div><div class="media-example"><span class="media-example-icon video">WebM</span><div><strong>WebM video</strong><small>Modern web video files</small></div></div></div>');
}
function openTikTokUnavailable() {
  openFeatureModal('TikTok is not available', 'IN DEVELOPMENT', '<div class="unavailable-message"><span class="platform-warning">!</span><p>The developer is working on TikTok support.</p></div>');
}
function openPlatformInfo(platform) {
  const details = {
    youtube: ['YouTube formats', 'SHORTS', 'YouTube exposes Shorts and other public video formats differently from regular downloadable files. This app can only offer what YouTube makes available for that link.'],
    instagram: ['Instagram formats', 'REELS', 'Instagram links can expose Reels or videos, depending on the post and its public access settings.'],
    facebook: ['Facebook formats', 'VIDEOS AND REELS', 'Facebook controls which public videos and Reels provide downloadable media. Private or restricted posts cannot be accessed.'],
    twitter: ['X / Twitter formats', 'VIDEOS', 'X / Twitter posts may expose a public video, but images and protected media are not offered as downloadable formats here.']
  }[platform];
  if (!details) return;
  openFeatureModal(details[0], details[1], `<div class="platform-info-message"><p>${details[2]}</p><small>Availability depends on the source app or website.</small></div>`);
}
function openFeatureModal(title, kicker, body) { featureModalTitle.textContent = title; featureModalKicker.textContent = kicker; featureModalBody.innerHTML = body; featureModal.classList.remove('hidden'); }
function closeFeatureModal() { featureModal.classList.add('hidden'); }
function copyText(value, button) { const copied = () => { button.textContent = 'Copied'; }; if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(value).then(copied).catch(() => copyTextFallback(value, copied)); } else copyTextFallback(value, copied); }
function copyTextFallback(value, onSuccess) { const textarea = document.createElement('textarea'); textarea.value = value; textarea.style.position = 'fixed'; textarea.style.opacity = '0'; document.body.appendChild(textarea); textarea.select(); try { document.execCommand('copy'); onSuccess(); } finally { textarea.remove(); } }
function openShareTool(title = 'QR / continue on phone', url = input.value.trim(), mediaTitle = '') { const target = url || window.location.href; const qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(target)}`; openFeatureModal(title, 'SEND TO PHONE', `<div class="share-tool"><img src="${qr}" alt="QR code for ${escapeAttr(target)}"><div><strong>${escapeHtml(mediaTitle || 'MediaDrop')}</strong><p>Scan this code on your phone to open the link.</p><button class="primary-button copy-share" type="button">Copy link</button><small class="share-url">${escapeHtml(target)}</small></div></div>`); featureModalBody.querySelector('.copy-share').onclick = (event) => copyText(target, event.currentTarget); }
function openPrivateLink(url, title) { const token = crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10); const privateUrl = `${window.location.origin}/#drop-${token}`; openFeatureModal('Private download link', 'TEMPORARY SHARE', `<div class="private-link"><strong>${escapeHtml(title)}</strong><p>Your browser-only link expires in 30 minutes.</p><input readonly value="${escapeAttr(privateUrl)}"><button class="primary-button copy-share" type="button">Copy link</button></div>`); featureModalBody.querySelector('.copy-share').onclick = (event) => copyText(privateUrl, event.currentTarget); }
function openLocker() { const items = getStoredList('mediadrop-locker'); openFeatureModal('My media', 'TEMPORARY CLOUD LOCKER', items.length ? items.map((item) => `<div class="locker-item"><strong>${escapeHtml(item.title)}</strong><span>${formatBytes(item.size || 0)} · Expires in 24 hours</span></div>`).join('') : '<p class="empty-state">Downloaded files appear here for 24 hours. Your actual files remain in your browser downloads.</p>'); }
function openStats() { const stats = JSON.parse(localStorage.getItem('mediadrop-stats') || '{"downloads":0,"bytes":0,"types":{}}'); openFeatureModal('MediaDrop stats', 'YOUR DOWNLOAD RHYTHM', `<div class="stats-grid"><div><strong>${stats.downloads}</strong><span>Downloads</span></div><div><strong>${formatBytes(stats.bytes)}</strong><span>Total data</span></div><div><strong>${stats.types.video || 0}</strong><span>Videos</span></div><div><strong>${stats.types.image || 0}</strong><span>Images</span></div><div><strong>${stats.types.audio || 0}</strong><span>Audio</span></div><div><strong>${stats.types.transcript || 0}</strong><span>Transcripts</span></div></div><button class="stats-clear" id="stats-clear" type="button">Clear stats</button>`); featureModalBody.querySelector('#stats-clear').addEventListener('click', () => { localStorage.removeItem('mediadrop-stats'); localStorage.removeItem('mediadrop-stats-accurate-v1'); renderFeatureCounts(); openStats(); }); }
function openThemeStudio() { openFeatureModal('Theme studio', 'CUSTOM UI THEMES', `<div class="theme-grid">${['light|Default','dark|Midnight','aurora|Aurora','ocean|Ocean','sunset|Sunset','forest|Forest','cyber|Cyber'].map((theme) => { const [id, label] = theme.split('|'); return `<button type="button" data-theme-choice="${id}"><span></span>${label}</button>`; }).join('')}</div>`); featureModalBody.querySelectorAll('[data-theme-choice]').forEach((button) => button.onclick = () => { const choice = button.dataset.themeChoice; document.documentElement.dataset.theme = choice === 'light' ? '' : choice; localStorage.setItem('mediadrop-theme', choice); closeFeatureModal(); }); }
function saveLockerItem(item) { const items = getStoredList('mediadrop-locker').filter((saved) => saved.url !== item.url); localStorage.setItem('mediadrop-locker', JSON.stringify([item, ...items].slice(0, 20))); renderFeatureCounts(); }
function incrementStats(bytes, type) { const stats = JSON.parse(localStorage.getItem('mediadrop-stats') || '{"downloads":0,"bytes":0,"types":{}}'); if (!localStorage.getItem('mediadrop-stats-accurate-v1')) { stats.bytes = 0; localStorage.setItem('mediadrop-stats-accurate-v1', '1'); } stats.downloads += 1; stats.bytes += Number(bytes) || 0; const mediaType = type || (document.querySelector('.source-platform')?.textContent.includes('Image') ? 'image' : 'video'); stats.types[mediaType] = (stats.types[mediaType] || 0) + 1; localStorage.setItem('mediadrop-stats', JSON.stringify(stats)); renderFeatureCounts(); }
function renderFeatureCounts() { const library = getStoredList('mediadrop-history'); const stats = JSON.parse(localStorage.getItem('mediadrop-stats') || '{"downloads":0}'); document.querySelector('#locker-count').textContent = library.length; animateCounter(document.querySelector('#stats-downloads'), Number(stats.downloads) || 0); }
function animateCounter(element, target) { if (!element) return; const start = Number(element.textContent) || 0; if (start === target) return; const started = performance.now(); const tick = (now) => { const progress = Math.min((now - started) / 550, 1); element.textContent = Math.round(start + (target - start) * (1 - Math.pow(1 - progress, 3))); if (progress < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
async function checkConnection() { const status = document.querySelector('#connection-status'); const detail = document.querySelector('#connection-detail'); if (!navigator.onLine) { status.textContent = 'Offline'; detail.textContent = 'Check your connection before analyzing media.'; return; } status.textContent = 'Connected'; detail.textContent = 'Verifying server...'; const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 1500); const started = performance.now(); try { const response = await fetch(`${API_BASE}/api/health`, { cache: 'no-store', signal: controller.signal }); const latency = Math.round(performance.now() - started); status.textContent = response.ok ? 'Connected · Excellent' : 'Service unavailable'; detail.textContent = `${latency} ms latency · Updated just now`; } catch { status.textContent = navigator.onLine ? 'Connected · Local' : 'Offline'; detail.textContent = navigator.onLine ? 'Server check timed out · Browser is online' : 'Check your connection before analyzing media.'; } finally { clearTimeout(timeout); } }
function getYouTubeId(value) { try { const parsed = new URL(value); return parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v'); } catch { return null; } }
function getTikTokId(value) { const match = String(value).match(/\/video\/(\d+)/i); return match ? match[1] : null; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
function escapeAttr(value) { return escapeHtml(value); }
