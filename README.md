# MediaDrop

MediaDrop is a no-account public media downloader interface. This implementation processes direct HTTP(S) media URLs when their response is a supported video or image type. Social platform providers are isolated and return an honest availability message until an authorized provider/API integration is configured.

## Requirements

- Node.js 20 or newer
- npm

## Installation

```bash
npm install
copy .env.example .env
```

## Development and production

```bash
npm run dev
npm start
```

The Express server serves the frontend and API from the same origin at `http://localhost:3000`.

## API

- `GET /api/health` checks service status.
- `POST /api/media/info` accepts `{ "url": "https://..." }` and returns verified metadata/formats.
- `POST /api/media/download` accepts `{ "url": "...", "formatId": "..." }` and streams a verified direct media file.
- `POST /api/media/cancel` acknowledges cancellation for future provider jobs.

## Provider architecture

Providers live under `backend/providers/<platform>/provider.js` and share `detect` and `getMediaInfo` entry points. Add a new provider, register it in `backend/server.js`, and implement only permitted retrieval methods. Do not bypass login, DRM, CAPTCHA, paywalls, or access controls.

## Security

The API validates HTTP(S) URLs, rejects credentials and private/internal destinations, resolves DNS before fetching, applies Helmet/CORS, rate limits API calls, times out upstream requests, caps JSON and media sizes, and limits concurrent streams. Media is streamed and is not stored by default.

Set limits with `.env`: `MAX_FILE_SIZE_MB` (default `2048`), `MAX_CONCURRENT_DOWNLOADS`, and `CORS_ORIGIN`.
