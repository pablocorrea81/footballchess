## Football Chess Web App

This repository contains the Next.js frontend for the Football Chess multiplayer experience. It is configured to deploy on Vercel and communicate with Supabase for authentication, realtime gameplay sync, and persistence.

## Prerequisites

- Node.js 20+
- npm 10+
- A Supabase project with row level security enabled

## Environment Variables

Create a `.env.local` file at the project root (never commit it) using the example as a reference:

```bash
cp .env.local.example .env.local
```

Set the following values obtained from the Supabase dashboard:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Installing Dependencies

```bash
npm install
```

## Local Development

```bash
npm run dev
```

Then visit [http://localhost:3000](http://localhost:3000).

## Deploying

1. Push changes to GitHub.
2. Connect the repository to Vercel (if not already).
3. Configure the Supabase environment variables in Vercel.
4. Deploy from the `main` branch (or the branch of your choice).

## Next Steps

- Implement Supabase authentication flow.
- Build the realtime match lobby backed by the `games` table.
- Encode the Football Chess rules in `RuleEngine`.
