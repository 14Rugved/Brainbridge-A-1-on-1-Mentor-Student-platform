# Mentor-Student Platform (FastAPI + Next.js + Supabase + Socket.IO)

Full-stack 1-on-1 mentor-student real-time coding platform.

## Architecture

- Backend: FastAPI + Python Socket.IO + SQLAlchemy + Alembic
- Frontend: Next.js (App Router) + Supabase client auth + Monaco Editor
- Auth/DB: Supabase (JWT + Postgres)
- Realtime: Socket.IO for editor/chat/presence/WebRTC signaling

## Repository Structure

- `apps/backend` - API, realtime server, DB models, migrations
- `apps/frontend` - UI app (auth, dashboard, session room)
- `infra/supabase/schema.sql` - Supabase SQL + RLS policies

## Backend Features

- Role-based auth (`mentor`, `student`) via Supabase JWT
- Session lifecycle: create, join, end, list, status updates
- Message persistence with `text/code/system` types
- Snapshot persistence for editor state
- Optional code execution API (`/run/`) via Piston
- WebRTC signaling events for 1-on-1 video calls

## Frontend Features

- Login/Signup via Supabase
- Dashboard:
  - create scheduled session (mentor)
  - join by room key
  - list your sessions
- Session room:
  - collaborative Monaco editor
  - chat (text + code snippets)
  - snapshot save
  - code run output panel
  - WebRTC local/remote video panels

## Local Setup

### Backend

```bash
cd apps/backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Required backend env values:
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_JWT_SECRET`

Optional:
- `PISTON_API_URL` (for `/run/` endpoint)

### Frontend

```bash
cd apps/frontend
npm install
copy .env.example .env.local
npm run dev
```

Required frontend env values:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_BACKEND_URL` (example `http://localhost:8000`)
- `NEXT_PUBLIC_API_BASE_URL` (example `http://localhost:8000/api/v1`)

Open `http://localhost:3000`.

## Docker

```bash
docker compose up --build
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- Postgres: `localhost:5432`
