# ScheduleChat

Personal schedule + time-tracking app with an AI copilot.

# Stack

- Next.js 14 (App Router, TS strict) 
- MongoDB/Mongoose
- SCSS Modules 
- dnd-kit 
- TanStack Query 
- Zustand 
- NextAuth (Credentials) 
- Anthropic API (tool use) /Gemini API (tool use)
- SSE realtime.


## Local setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `AI_PROVIDER` — `anthropic` (default) or `gemini`
   - `ANTHROPIC_API_KEY` — from console.anthropic.com (if using Anthropic)
   - `GEMINI_API_KEY` — from aistudio.google.com (if using Gemini)
   - `MONGODB_URI` — e.g. `mongodb://localhost:27017/schedulechat`, or an Atlas URI
   - `NEXTAUTH_SECRET` — any long random string (`openssl rand -base64 32`)
   - `APP_USER_EMAIL` / `APP_USER_PASSWORD` — your login for the single-user seed
3. Make sure MongoDB is running locally (or point `MONGODB_URI` at Atlas).
4. `npm run seed` — creates your user, the default tabs (Projects, DSA, System
   Design, Project Progress), and one sample task.
5. `npm run dev` — open http://localhost:3000, log in with the email/password from
   step 2.
