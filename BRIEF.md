# Ivy Portal — Personal OpenClaw Dashboard

## What This Is
A localhost-only web dashboard for George's personal infrastructure. This is the UI for "god mode" — a single page that shows everything Ivy (George's AI assistant) knows and manages.

## Tech Stack
- **Backend:** Node.js + Express (simple, fast)
- **Frontend:** Vanilla HTML/CSS/JS (no frameworks, keep it light)
- **Database:** SQLite (read existing databases, don't create new ones)
- **Port:** 18790 (next to OpenClaw gateway at 18789)
- **Auth:** Localhost only, no auth needed

## Data Sources (READ ONLY — these files/databases already exist)

### 1. Subscriptions & Finance
- `~/.openclaw/workspace/data/subscription-registry.json` — all subscriptions, credit cards, payments
- Run `python3 ~/.openclaw/workspace/tools/recurring-payments.py --upcoming 14` for upcoming bills
- Run `python3 ~/.openclaw/workspace/tools/recurring-payments.py --overdue` for overdue

### 2. Commitments & Tasks  
- `~/.openclaw/workspace/data/commitments.json` — active commitments with due dates
- `~/.openclaw/knowledge.sqlite` — knowledge graph (entities, relations, commitments tables)

### 3. Calendar
- Run `gog calendar list primary --from TODAY --to NEXT_WEEK --json` for events

### 4. Email
- Run `gog mail search "is:unread" --max 20 --json` for unread

### 5. GitHub CI
- Run `gh run list --repo g-but/REPO --limit 1 --json status,conclusion,name` for each repo
- Repos: orangecat, botsmann, revampit, aoz-housing, revamp-info, swiss-longevity-hub

### 6. Cron Jobs
- `~/.openclaw/cron/jobs.json` — all scheduled jobs with last run status

### 7. System Health
- `free -m` — memory
- `df -h /` — disk
- `uptime` — load
- `systemctl --user is-active openclaw-gateway` — gateway status
- `systemctl --user is-active whatsapp-monitor.timer` — WhatsApp monitor

### 8. Memory
- `~/.openclaw/workspace/memory/` — daily log files
- `~/.openclaw/workspace/MEMORY.md` — long-term memory

## Dashboard Layout (Single Page)

```
┌─────────────────────────────────────────────────────────┐
│  🌿 Ivy Portal                              [refresh]   │
├─────────────┬───────────────────────────────────────────┤
│             │                                           │
│  SYSTEM     │  TODAY                                    │
│  ○ Gateway  │  Calendar events                          │
│  ○ WhatsApp │  Commitments due                          │
│  ○ Telegram │  Weather                                  │
│  ○ Memory   │                                           │
│  ○ Disk 70% │  ─────────────────────────                │
│  ○ RAM 80%  │                                           │
│             │  FINANCE                                  │
│  CRONS      │  Subscriptions table                      │
│  8 active   │  Credit cards status                      │
│  last: 2h   │  Upcoming bills                           │
│             │                                           │
│             │  ─────────────────────────                │
│             │                                           │
│             │  PROJECTS                                 │
│             │  CI status per repo                       │
│             │  (green/red badges)                       │
│             │                                           │
│             │  ─────────────────────────                │
│             │                                           │
│             │  EMAIL                                    │
│             │  Unread count                             │
│             │  Action items                             │
│             │                                           │
└─────────────┴───────────────────────────────────────────┘
```

## Design
- Dark theme (dark gray background, light text)
- Clean, minimal, information-dense
- Status indicators: 🟢 green = OK, 🟡 yellow = warning, 🔴 red = error
- Auto-refresh every 60 seconds
- Mobile-responsive (George checks on phone too)
- No charts or graphs in MVP — just clean data tables and status indicators

## API Endpoints (Express)

```
GET /api/system    — system health (memory, disk, gateway, channels)
GET /api/calendar  — today + this week events
GET /api/finance   — subscriptions + upcoming bills
GET /api/projects  — CI status per repo
GET /api/email     — unread summary
GET /api/crons     — cron job status
GET /api/commitments — active commitments
```

Each endpoint shells out to the relevant tool/command and returns JSON.

## MVP Scope
Build the full single-page dashboard with all 7 sections. Don't overcomplicate it — read data, display data. The backend is just thin wrappers around existing CLI tools and JSON files.

## Important
- Do NOT modify any existing files outside this project directory
- Do NOT install system packages
- Use `npm init` and minimal dependencies (express, better-sqlite3)
- The dashboard must work on localhost:18790
- Test that it starts and serves the page before declaring done
