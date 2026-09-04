const { createProvider } = require('../_yt-dlp');
module.exports = createProvider('instagram', (url) => /instagram\.com/i.test(url));
