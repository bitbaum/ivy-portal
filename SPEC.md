# Ivy Portal — Unified Spec

_Single dashboard for everything Ivy knows and manages._

## Architecture

```
ivy-portal/
├── server.js          # Express API + static serving
├── public/            # Dashboard UI (vanilla HTML/CSS/JS)
├── lib/
│   ├── messages-schema.sql    # Chat history DB schema
│   ├── financial-schema.sql   # Financial tracking schema
│   ├── entity-schema.sql      # Knowledge graph schema
│   ├── telegram-indexer.js    # Telegram history → SQLite
│   └── whatsapp-indexer.js    # WhatsApp history → SQLite
├── SPEC.md            # This file
├── ROADMAP.md         # Full god-mode phases (from projects/god-mode)
├── ARCHITECTURE.md    # System architecture
└── BRIEF.md           # Original dashboard brief
```

- **Port:** 18790 (localhost only, no auth)
- **Stack:** Node.js + Express, vanilla frontend, SQLite reads
- **Principle:** Read-only dashboard. Never mutates Ivy's data. Shells out to existing tools.

## MVP (v1) — EXISTS, needs polish

8 API endpoints, single-page dark dashboard:

| Endpoint | Source | Status |
|----------|--------|--------|
| `/api/system` | `free`, `df`, `systemctl` | ✅ Working |
| `/api/calendar` | `gog calendar list --json` | ✅ Working |
| `/api/finance` | `recurring-payments.py`, subscription-registry.json | ✅ Working |
| `/api/projects` | `gh run list --json` | ✅ Working |
| `/api/email` | `gog mail search --json` | ✅ Working |
| `/api/crons` | `~/.openclaw/cron/jobs.json` | ✅ Working |
| `/api/commitments` | `data/commitments.json` | ✅ Working |
| `/api/memory` | `memory/*.md` (last 3 days) | ✅ Working |

**Needed:** systemd service to keep it running, auto-refresh UI, mobile layout fixes.

## v2 — Message History Search

The killer feature. Full-text search across all Telegram + WhatsApp conversations.

- Telegram indexer pulls all dialogs → `messages.sqlite`
- WhatsApp indexer does the same
- New endpoint: `/api/messages?q=...&chat=...&since=...`
- UI: search bar + results with chat context
- Incremental updates every 5 min via background job

Schemas and indexer code exist in `lib/`. Need: wiring, testing, background scheduling.

## v3 — Knowledge Graph Explorer

Visual interface to `~/.openclaw/knowledge.sqlite`:
- Entity list with relationships
- Commitment tracker (due dates, overdue)
- Timeline view of decisions + events

## v4 — Real-time

- WebSocket for live system health updates
- Cron run notifications
- PWA for mobile
