# Ivy Portal — Unified Spec

_Single dashboard for everything Ivy knows and manages._

**Last updated:** 2026-09-04

## Architecture

```
ivy-portal/
├── server.js          # Express API + static serving + better-sqlite3
├── public/            # Dashboard UI (vanilla HTML/CSS/JS)
├── lib/
│   ├── messages-schema.sql    # Chat history DB schema (future)
│   ├── financial-schema.sql   # Financial tracking schema (future)
│   ├── entity-schema.sql      # Knowledge graph schema (reference)
│   ├── telegram-indexer.js    # Telegram history → SQLite (future)
│   └── whatsapp-indexer.js    # WhatsApp history → SQLite (future)
└── ROADMAP.md         # God-mode phases with honest status
```

- **Port:** 18790 (localhost only, no auth)
- **Tailscale:** https://g-latitudee7470.tailf6c86e.ts.net:18790/
- **Stack:** Node.js + Express, vanilla frontend, better-sqlite3 for reads
- **Service:** `systemctl --user status ivy-portal`
- **Principle:** Read-only dashboard. Never mutates Ivy's data.

## Data Source: `~/.openclaw/knowledge.sqlite` (SSOT)

All data endpoints read from sqlite, read existing OpenClaw files
(`cron/jobs.json`, `memory/*.md`), or shell out to existing tools.
No duplicate data stores of its own.

## API Endpoints (10)

| Endpoint | Source | Status |
|----------|--------|--------|
| `/api/system` | `free`, `df`, `systemctl` | ✅ |
| `/api/calendar` | `gog calendar list --json` | ✅ |
| `/api/finance` | knowledge.sqlite subscriptions + `recurring-payments.py` | ✅ Fixed 2026-03-31 |
| `/api/projects` | `gh run list --json` (6 repos) | ✅ |
| `/api/email` | `gog mail search --json` | ✅ |
| `/api/crons` | `~/.openclaw/cron/jobs.json` | ✅ |
| `/api/commitments` | knowledge.sqlite commitments | ✅ Fixed 2026-03-31 |
| `/api/memory` | `memory/*.md` (last 5 days) | ✅ |
| `/api/knowledge` | knowledge.sqlite entities + relations | ✅ New 2026-03-31 |
| `/api/style` | knowledge.sqlite style_profile | ✅ New 2026-03-31 |
