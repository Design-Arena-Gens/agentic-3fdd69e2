# Gmail Auto-Responder

Web application that connects to your Gmail inbox, surfaces unread messages, and lets you answer them instantly with smart templates or one-click replies. Built with Next.js (App Router), NextAuth, and the Gmail API so it deploys cleanly on Vercel.

## Features

- Google OAuth login with delegated Gmail scopes.
- Fetches unread messages from the primary inbox and shows subject, sender, and snippet.
- Curated reply templates plus a "smart draft" generator that personalises a response based on the incoming message.
- Inline editor and single-click send that marks messages as read and starred.
- Session-aware UI with refresh & bulk-answer controls.

## Prerequisites

1. Create a Google Cloud project and configure an OAuth client (Web application).
2. Enable the Gmail API for the project.
3. Set the authorised redirect URI to `https://YOUR_DOMAIN/api/auth/callback/google` (production) and `http://localhost:3000/api/auth/callback/google` (local).

Populate `.env` from `.env.example`:

```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
NEXTAUTH_SECRET=generate_a_long_random_secret
NEXTAUTH_URL=http://localhost:3000
```

> Generate `NEXTAUTH_SECRET` via `openssl rand -base64 32`.

## Local Development

```bash
npm install
npm run dev
```

Visit http://localhost:3000 and sign in with the Google account you want to manage.

## Production Deployment

1. Ensure the required environment variables are configured in your hosting environment (e.g. Vercel project settings).
2. Build to verify locally: `npm run build`.
3. Deploy with Vercel: `vercel deploy --prod --yes --name agentic-3fdd69e2`.

Once deployed, the app is served from `https://agentic-3fdd69e2.vercel.app`.
