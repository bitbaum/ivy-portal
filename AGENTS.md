# AGENTS.md — Ivy Portal Development Guide

<!-- fleet:rules:begin — generated from bitbaum/fleet templates/agent-rules.md; edit it there, not here -->

## Org rules

Read `bitbaum/fleet` `AGENTS.md`, `SHARED.md` and the registers it names before
inventing a host, a name, a page or a shared behaviour. Do not copy their facts
into this file.

- **Packages first.** If a `@bitbaum/*` package (or `bip-kit`, `limitkit`,
  `threadkit`, `ai-forms`) already does it, use it and fix a defect in the
  package, not in this app. Every chat is `@bitbaum/chatkit`, every search box
  `@bitbaum/searchkit`, every chart `@bitbaum/chartkit`, accounts
  `@bitbaum/accountkit`, model calls `@bitbaum/ai-kit`. Review this product's
  `package-plan.json` before building anything.
- **One shape per kind.** Things of the same kind look the same and sit in the
  same place (fleet `AGENTS.md`, "One shape per kind").
- **Finished work ships by itself.** Open a non-draft pull request; the fleet
  auto-merge sweep is the only merge path. Never merge by hand, through the
  merge API, with `--auto` or with an admin bypass, and never force-push a
  shared branch.
- **Nothing made up.** A fact on a page or in a doc needs a source that was
  opened; where there is none, the line is removed or softened.
- **Bitcoin orange is for Bitcoin and top-of-funnel actions only.**
- **No model identifier** in anything pushed to a repository.
- Before you finish, run `node <fleet>/scripts/ci/docs-truth-audit.mjs --dir .`:
  the same check the sweep runs on every pull request.

<!-- fleet:rules:end -->

Org rules are [bitbaum/fleet AGENTS.md](https://github.com/bitbaum/fleet/blob/main/AGENTS.md): packages by default (say why if you skip one), search through `@bitbaum/searchkit`, chat through `@bitbaum/chatkit`, shared names and the identity contract. Read that file. Do not restate it here.


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
- Tailscale URL display: ✓ Fixed — header links to https://g-latitudee7470.tailf6c86e.ts.net:18790
- Systemd service: ✓ Fixed — `ivy-portal.service` in repo root (`systemctl --user`)
- Action links should appear on ALL items that need attention, not just some
- Financial section: ✓ Fixed — overdue/upcoming render as structured cards from JSON; subscriptions table uses correct field names
- Memory section: ✓ Fixed — endpoint and UI rendering both implemented

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
- Don't add runtime dependencies beyond express, better-sqlite3, telegram, and input (pnpm is the package manager)
- Don't modify files outside ~/dev/ivy-portal/
- Don't add authentication (localhost only)
- Don't create a build step or bundler
- Don't convert to TypeScript — source stays plain JS; types are checked via `checkJs` (`pnpm run typecheck`)
