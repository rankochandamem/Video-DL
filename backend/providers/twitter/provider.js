const { createProvider } = require('../_yt-dlp');
module.exports = createProvider('twitter', (url) => /(?:x\.com|twitter\.com)/i.test(url));
