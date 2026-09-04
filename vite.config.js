const { defineConfig } = require('vite');
const path = require('path');

module.exports = defineConfig({
  root: path.join(__dirname, 'frontend'),
  server: {
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3001'
    }
  }
});