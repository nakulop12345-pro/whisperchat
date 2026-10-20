# WhisperChat

A lightweight, username-based chat web app designed for GitHub Pages and a Supabase backend.

## Current features
- Email/password sign-up and sign-in through Supabase Auth
- Unique usernames and username search
- One-to-one conversations and text messages
- Sent/seen status, message history, search through conversations
- Browser notifications while the app is open (permission required)
- Responsive dark UI; plain SVG-free text/Unicode icons keep the app lightweight
- Row-level security policies in `supabase/schema.sql`

## Important: first-time setup
This repository is the frontend; Supabase provides the database and authentication. It will not work until you configure a Supabase project.

1. Create a project at https://supabase.com/ (check its current free-plan limits).
2. In the Supabase dashboard, open **SQL Editor**, create a query, paste the entire contents of `supabase/schema.sql`, and run it.
3. Open **Authentication → URL Configuration** and add your GitHub Pages URL to the allowed redirect/site URLs after deployment.
4. Open **Project Settings → API** (or the API keys page) and copy the project URL and the **publishable/anon public key**. Never use or share a service-role/secret key in browser code.
5. Open the site and enter the project URL and public key on the connection screen. They are stored in this browser's local storage only.
6. Create an account with an email, password, and username. If email confirmation is enabled, confirm the email before signing in.
7. Enable GitHub Pages: repository **Settings → Pages → Deploy from a branch → main → /(root) → Save**. Wait for the published URL to appear.

## Database security
The SQL enables Row Level Security (RLS) on the profiles, conversations, and messages tables. Review the policies before using the app with real personal conversations. This is a starter project, not a security-audited end-to-end encrypted messenger. Messages are stored in the Supabase database and are not end-to-end encrypted.

## Current limitations
- Message updates use four-second polling, not realtime subscriptions.
- “Typing…” indicators are not implemented yet.
- Browser notifications only work when the website is open and the browser has granted permission. True background push requires a service worker plus push infrastructure.
- Account creation may require email confirmation depending on your Supabase Auth settings.
- This frontend is not an Android APK. It can be made installable as a PWA in a later step.
- No media attachments, group chats, password reset flow, or end-to-end encryption yet.

## Local development
Serve the repository with any static web server, or use GitHub Pages after configuring Supabase. Opening `index.html` directly can work in some browsers, but a local server is recommended.

## Privacy
Do not publish private messages, passwords, service-role keys, or personal data. The Supabase URL and public anon/publishable key are intended for client apps only when RLS and policies are configured correctly.