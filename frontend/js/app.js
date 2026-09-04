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

const platformNames = { direct: 'Direct media', youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', twitter: 'X / Twitter', tiktok: 'TikTok' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const themeIcon = themeToggle.querySelector('.theme-icon');
if (localStorage.getItem('mediadrop-theme') === 'dark') document.documentElement.dataset.theme = 'dark';
themeToggle.addEventListener('click', () => { const dark = document.documentElement.dataset.theme !== 'dark'; document.documentElement.dataset.theme = dark ? 'dark' : ''; localStorage.setItem('mediadrop-theme', dark ? 'dark' : 'light'); themeIcon.textContent = dark ? '☾' : '☼'; });
if (document.documentElement.dataset.theme === 'dark') themeIcon.textContent = '☾';

pasteButton.addEventListener('click', async () => { try { input.value = await navigator.clipboard.readText(); input.focus(); } catch { input.focus(); } });
clearButton.addEventListener('click', () => { input.value = ''; formError.textContent = ''; input.focus(); });

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
  resultSection.classList.remove('hidden'); processing.classList.remove('hidden'); result.innerHTML = ''; resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
  processingTitle.textContent = 'Detecting platform...'; await sleep(550); processingTitle.textContent = 'Checking media access...'; await sleep(550); processingTitle.textContent = 'Preparing available formats...';
  try { const response = await fetch('/api/media/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) }); const data = await response.json(); if (!response.ok) throw data; renderResult(data, url); } catch (error) { renderError(error); }
  processing.classList.add('hidden');
});

function renderError(error) { result.innerHTML = `<div class="status-message"><strong>${escapeHtml(error.error || 'Something Went Wrong')}</strong><p>${escapeHtml(error.message || 'Please try again later.')}</p><button class="new-link" type="button">New link</button></div>`; result.querySelector('.new-link').addEventListener('click', reset); }
function renderResult(data, url) {
  const youtubeId = data.platform === 'youtube' ? getYouTubeId(url) : null;
  const tiktokId = data.platform === 'tiktok' ? getTikTokId(url) : null;
  const isFacebookVideo = data.platform === 'facebook' && data.type === 'video' && !data.preview;
  const embedOrigin = encodeURIComponent(window.location.origin);
  const preview = youtubeId ? `<iframe class="youtube-embed" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?origin=${embedOrigin}&enablejsapi=1&rel=0&modestbranding=1" title="${escapeAttr(data.title)}" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>` : tiktokId ? `<iframe class="youtube-embed" src="https://www.tiktok.com/player/v1/${encodeURIComponent(tiktokId)}?description=1&music_info=1&rel=0" title="${escapeAttr(data.title)}" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>` : isFacebookVideo ? `<iframe class="youtube-embed" src="https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=false" title="${escapeAttr(data.title)}" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>` : data.type === 'video' && data.preview ? `<video controls playsinline preload="metadata" poster="${escapeAttr(data.thumbnail || '')}" src="${escapeAttr(data.preview)}"></video>` : data.thumbnail ? `<div class="thumbnail-fallback"><img src="${escapeAttr(data.thumbnail)}" alt="${escapeAttr(data.title)}"><span>Preview unavailable</span></div>` : data.type === 'image' && data.preview ? `<img src="${escapeAttr(data.preview)}" alt="${escapeAttr(data.title)}">` : `<div class="preview-empty"><strong>Preview unavailable</strong><span>You can still download the available media below.</span></div>`;
  const formats = (data.formats || []).map((format) => `<div class="format-row"><div><strong>${escapeHtml(format.quality)} ${escapeHtml(format.extension.toUpperCase())}</strong><small class="format-size">${escapeHtml(format.size)}</small></div><div class="format-action"><div class="download-progress-row hidden"><span class="result-label">DOWNLOAD PROGRESS</span><div class="progress-track"><div class="progress-bar"></div></div><small class="progress-copy">Starting secure stream...</small></div><button class="download-format" data-id="${escapeAttr(format.id)}">Download ↗</button></div></div>`).join('');
  const transcriptButton = data.transcriptAvailable ? `<div class="format-row transcript-row"><div class="transcript-copy"><strong>Transcript</strong></div><button class="download-transcript" type="button">Download ↗</button></div>` : '';
  const formatLabels = [...new Set([...(data.formats || []).map((format) => format.extension.toUpperCase()), ...(data.transcriptAvailable ? ['Transcript'] : [])])];
  const formatSummary = formatLabels.length ? (formatLabels.length === 1 ? formatLabels[0] : `${formatLabels.slice(0, -1).join(', ')} & ${formatLabels[formatLabels.length - 1]}`) : 'No options';
  const sourceIcon = data.platform === 'youtube' ? '<span class="youtube-source-icon" role="img" aria-label="YouTube logo"><span>▶</span></span>' : '<span class="source-icon">↗</span>';
  result.innerHTML = `<div class="media-preview"><div class="preview-frame">${preview}</div><div class="source-meta"><div class="source-title">${escapeHtml(data.title)}</div><div class="source-platform">${sourceIcon}${escapeHtml(platformNames[data.platform] || data.platform)}<span class="source-menu">⋮</span></div></div></div><div class="format-panel"><div class="result-header"><h2 class="result-title">Download options</h2><span class="result-format-summary">${escapeHtml(formatSummary)}</span></div><div>${formats || '<p class="status-message">No downloadable formats were returned.</p>'}</div>${transcriptButton}</div>`;
  result.querySelectorAll('.download-format').forEach((button) => { button.onclick = () => downloadMedia(url, button.dataset.id, button); });
  const transcriptButtonNode = result.querySelector('.download-transcript');
  if (transcriptButtonNode) transcriptButtonNode.addEventListener('click', () => downloadTranscript(url));
  const newLinkNode = result.querySelector('.new-link');
  if (newLinkNode) newLinkNode.addEventListener('click', reset);
}

async function downloadTranscript(url) {
  try {
    const response = await fetch('/api/media/transcript', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    if (!response.ok) throw await response.json();
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = match ? decodeURIComponent(match[1]) : 'transcript.txt';
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) {
    formError.textContent = error.error || error.message || 'Transcript is unavailable for this link.';
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

async function downloadMedia(url, formatId, button) {
  button.disabled = false; button.textContent = 'Cancel'; button.classList.add('download-cancel-active'); const row = button.closest('.format-row'); const controller = new AbortController(); const progress = row.querySelector('.download-progress-row'); button.onclick = () => { progress.classList.add('hidden'); showDownloadCanceled(); controller.abort(); }; progress.classList.remove('hidden'); progress.style.flexBasis = '100%'; progress.style.marginTop = '0'; progress.querySelector('.progress-bar').style.width = '0'; progress.querySelector('.progress-copy').textContent = 'Starting secure stream...';
  try { const response = await fetch('/api/media/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, formatId }), signal: controller.signal }); if (!response.ok) throw await response.json(); const total = Number(response.headers.get('content-length')) || 0; if (total) row.querySelector('.format-size').textContent = formatBytes(total); let loaded = 0; const chunks = []; const reader = response.body.getReader(); while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); loaded += value.length; const percent = total ? Math.round(loaded / total * 100) : 0; progress.querySelector('.progress-bar').style.width = `${percent}%`; progress.querySelector('.progress-copy').textContent = total ? `${percent}% · ${formatBytes(loaded)} of ${formatBytes(total)}` : `${formatBytes(loaded)} downloaded`; } const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = (url.split('/').pop() || 'mediadrop-download').split('?')[0]; link.click(); URL.revokeObjectURL(link.href); progress.querySelector('.progress-copy').textContent = '✓ Download complete'; button.textContent = 'Download again ↗'; button.classList.remove('download-cancel-active'); button.onclick = () => confirmDownloadAgain(url, formatId, button); } catch (error) { if (error.name === 'AbortError') progress.classList.add('hidden'); else progress.querySelector('.progress-copy').textContent = error.error || error.message || 'Download unavailable'; button.textContent = error.name === 'AbortError' ? 'Download ↗' : 'Try again ↗'; button.classList.remove('download-cancel-active'); button.onclick = error.name === 'AbortError' ? () => downloadMedia(url, formatId, button) : () => confirmDownloadAgain(url, formatId, button); }
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
function reset() { input.value = ''; result.innerHTML = ''; resultSection.classList.add('hidden'); formError.textContent = ''; window.scrollTo({ top: 0, behavior: 'smooth' }); input.focus(); }
function formatBytes(bytes) { if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function getYouTubeId(value) { try { const parsed = new URL(value); return parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v'); } catch { return null; } }
function getTikTokId(value) { const match = String(value).match(/\/video\/(\d+)/i); return match ? match[1] : null; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
function escapeAttr(value) { return escapeHtml(value); }
