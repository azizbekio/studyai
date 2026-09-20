# StudyAI

An AI-assisted study platform for students in Uzbekistan. Students plan their day, get a study
plan from an AI mentor, generate quizzes on any topic, review what they got wrong through
spaced repetition, and track their progress with streaks, levels and a public leaderboard.

**Live:** https://studyai-dusky.vercel.app · **Author:** Azizbek Axmadov ([@Azizbek_Axmadov](https://t.me/Azizbek_Axmadov))

The interface is bilingual (Uzbek / English) and the app installs as a PWA and keeps working offline.

---

## Why it exists

Students here mostly study with a paper notebook and a group chat. Two things are missing:
a plan that adapts to how much time they actually have, and feedback on what they got wrong.
StudyAI closes that loop: plan → study → test → review the mistakes → see the trend.

## What it does

| Area | Details |
| --- | --- |
| Daily tasks | Add tasks with an hour estimate; mark them done, partial or missed. An AI can draft the day's schedule and the schedule parses back into real tasks. |
| AI mentor | Streaming chat that knows the student's goal, daily time budget and today's task list. |
| Quizzes | Multiple-choice quizzes generated from a topic, a pasted set of notes, or one of seven preset subjects (maths, biology, chemistry, physics, English, IELTS, SAT). Every wrong answer becomes a flashcard automatically. |
| Grading | Per-subject estimated grade (A+ / A / B / C) from the running average, plus an AI breakdown of which sub-topics are weak. |
| Flashcards | Leitner spaced repetition with 1 / 3 / 7 / 16 / 35-day intervals, editable and deletable. |
| Planning | Long-term goal analysis and an "ideal plan" with monthly milestones and a weekly load chart. |
| Motivation | XP, seven levels, ten badges, daily streak, coins, a global leaderboard and student clubs that compete on total XP. |
| Analytics | Stacked activity chart, completion-rate line chart, a 14-day table, and an AI weekly review. |

## Architecture

```
Browser (PWA)                     Vercel                         Data
────────────                      ──────                         ────
index.html        ── fetch ──▶    /api/chat     ── stream ──▶    Groq LLM API
  vanilla JS,                     /api/auth     ── verify ──▶    Google OAuth tokeninfo
  no framework                    /api/saveuser                  Supabase (PostgreSQL)
studyai-extra.js                  /api/log                       Supabase
  add-on module                   /api/scores                    Supabase
sw.js (offline cache)             /api/clubs                     Supabase
                                  /api/admin                     Supabase
localStorage — source of truth for the student's own data
```

**Stack:** vanilla JavaScript (no framework, no build step), Chart.js, Service Worker + Web App
Manifest, Vercel serverless functions, Groq LLM API with model fallback and SSE streaming,
Google Identity Services, Supabase (PostgreSQL), Google Analytics 4.

### Design decisions worth explaining

**No framework, single HTML file.** The target audience is on cheap Android phones and metered
mobile data. Shipping one file with no bundle, no hydration and no runtime dependency keeps the
first paint fast and makes the whole app cacheable by the service worker in one request. The cost
is discipline: all state lives in a small set of module-level variables with explicit render
functions, which is manageable at this size.

**Local-first data.** Tasks, cards, XP and chat history are written to `localStorage` first, so the
app is fully usable offline and with no account. The cloud is a backup and a leaderboard, never a
prerequisite. New features are added the same way: `studyai-extra.js` is a separate module that
attaches to the running app at load time instead of being merged into the main file, so a bug in a
new feature cannot break the core.

**Server-only database access.** The browser never holds a Supabase key. Row-level security is on
with no policies, and every read or write goes through a Vercel function that uses the service-role
key from an environment variable. The admin panel adds a password plus IP-based lockout after five
failed attempts.

**Streaming responses.** `/api/chat` proxies Groq's server-sent events, and the client parses the
delta stream and re-renders markdown incrementally, so the answer appears while it is being
written rather than after a ten-second wait.

## Database

| Table | Purpose |
| --- | --- |
| `studyai_users` | Registrations: name, email, picture, language, age, IP, timestamp |
| `studyai_activity` | Action log: chat messages, quizzes finished, tasks, plan generations |
| `studyai_scores` | XP, level, coins, streak, counters, club membership — one row per student |
| `studyai_clubs` | Club code, name, owner |
| `studyai_admin_attempts` | Failed admin logins, lockout window |

## Running it locally

```bash
git clone https://github.com/azizbekio/studyai
cd studyai
npm i -g vercel
vercel dev
```

Environment variables:

```
GROQ_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ADMIN_KEY
GOOGLE_CLIENT_SECRET
```

Then run `supabase-setup.sql` in the Supabase SQL editor to create the scores and clubs tables.

## Roadmap

- Move the remaining `localStorage` state (tasks, cards) behind the same server API as scores
- Club-vs-club weekly challenges with a fixed start and end
- A coin shop: hints, extra quiz attempts, profile themes
- Server-side validation of XP so the leaderboard cannot be edited from the console

## Licence

MIT
