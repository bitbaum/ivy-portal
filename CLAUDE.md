# CLAUDE.md — Ivy Portal Development Guide

## What This Is
Personal localhost dashboard for George's AI assistant infrastructure (OpenClaw). Dark theme, information-dense, mobile-responsive. Express + vanilla HTML/CSS/JS.

## Architecture
- `server.js` — Express backend, API endpoints that shell out to existing CLI tools and read JSON/SQLite files
- `public/index.html` — Single page layout
- `public/style.css` — Dark theme styles
- `public/app.js` — Frontend data fetching and rendering
- Port 18790, localhost only, no auth

## Data Sources (READ ONLY — never modify these)
- `~/.openclaw/workspace/data/subscription-registry.json` — subscriptions & credit cards
- `~/.openclaw/workspace/data/commitments.json` — active commitments
- `~/.openclaw/cron/jobs.json` — cron job definitions + state
- `~/.openclaw/knowledge.sqlite` — knowledge graph (entities, relations, commitments)
- `~/.openclaw/workspace/memory/*.md` — daily memory logs
- CLI: `gog calendar list`, `gog mail search`, `gh run list`, `free`, `df`, `uptime`, `systemctl`

## Design Principles
1. **Information density** — no wasted space, every pixel earns its place
2. **Action-oriented** — when something needs attention, provide a clickable link to fix it
3. **Dark theme** — dark gray (#0f1117) background, muted but readable text
4. **Mobile-first** — George checks on phone. Must be responsive.
5. **Auto-refresh** — 60s interval, visual indicator when refreshing
6. **No frameworks** — vanilla HTML/CSS/JS only. No React, no Tailwind, no build step.
7. **Graceful degradation** — if an API fails, show the error, don't crash the page

## Code Style
- Clean, readable JavaScript (no minification)
- CSS custom properties for theming
- Semantic HTML
- Error handling on every fetch
- Use `escHtml()` for all user-generated content

## What Needs Improvement
- Email section needs proper parsing (gog --json output format varies)
- Calendar section needs better event display
- Add Tailscale URL display (accessible remotely via https://g-latitudee7470.tailf6c86e.ts.net)
- Consider adding a simple systemd service file for auto-start
- Action links should appear on ALL items that need attention, not just some
- Financial section: the recurring-payments.py output is raw text in a <pre> — should be parsed and rendered as proper cards/table
- Memory section (recent daily logs) endpoint exists but isn't rendered in the UI yet

## Testing
```bash
# Start server
node server.js

# Test APIs
curl http://localhost:18790/api/system
curl http://localhost:18790/api/finance
curl http://localhost:18790/api/projects
curl http://localhost:18790/api/calendar
curl http://localhost:18790/api/email
curl http://localhost:18790/api/crons
curl http://localhost:18790/api/commitments
curl http://localhost:18790/api/memory
```

## Don't
- Don't add npm dependencies beyond express and better-sqlite3
- Don't modify files outside ~/dev/ivy-portal/
- Don't add authentication (localhost only)
- Don't create a build step or bundler
- Don't use TypeScript
