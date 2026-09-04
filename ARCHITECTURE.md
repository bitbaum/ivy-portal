# God Mode — Architecture

_Making Ivy omnimnesic: all-seeing, all-remembering, proactive._

## Components

### 1. Email Triage Layer (no AI, pure script)
**Purpose:** Never miss a deadline or financial consequence in email.
**How:** Scans unread emails, extracts deadlines/amounts/urgency using pattern matching.
**Output:** JSON file at `data/email-triage-results.json` — fed into daily brief.
**Schedule:** Every 2 hours via cron, plus before daily brief.
**Cost:** Zero (bash + python, no AI).

### 2. Dream Cycle (nightly Sonnet)
**Purpose:** Consolidate the day's events into wisdom. Like human sleep.
**How:** Reads today's session transcript + daily log + emails handled. Extracts:
  - Decisions made and why
  - Corrections/mistakes and lessons
  - New facts about George (preferences, patterns, relationships)
  - Commitments made (explicit or implicit)
  - Things that should have been caught but weren't
  - Predictions for tomorrow
**Output:** Appends to `memory/YYYY-MM-DD.md` (dream section) and promotes patterns to `memory/LEARNINGS.md`.
**Schedule:** Nightly at 03:30 (before 04:00 session reset).
**Cost:** ~3-5k tokens/night via OAuth (included in Max plan).

### 3. Proactive Scanner (future, needs GPU)
**Purpose:** Always-on background thinking. Connects dots without being asked.
**How:** Local 70B model running continuously, observing signals.
**Status:** BLOCKED — needs hardware upgrade (4090 GPU).

### 4. Dashboard UI
**Purpose:** George can see memory, documentation, system status, financials.
**How:** Local web app served on Tailscale.
**Status:** ✅ LIVE — this repo, port 18790 (see `SPEC.md`).

## Current Cron Schedule

| Cron | Time | Purpose | Cost |
|------|------|---------|------|
| Daily Brief | 08:30 | Calendar + inbox + priorities | ~2k tokens |
| Brief Fallback | 08:38 | Retry if 08:30 fails | ~2k tokens |
| Email Scanner | 07/11/15/19:00 | Deadline + financial detection | ~500 tokens |
| Evening Wrap | 20:00 Sun-Thu | Day summary + tomorrow prep | ~1.5k tokens |
| Dream Cycle | 03:30 | Nightly memory consolidation | ~3-5k tokens |
| Weekly Metrics | Mon 09:00 | System + project metrics | ~2k tokens |
| Weekly Summary | Mon 10:00 | Project status overview | ~2k tokens |
| Friday Preview | Fri 20:00 | Weekend outlook | ~1.5k tokens |

**Total estimated daily token usage:** ~15-20k tokens (all included in Max plan via OAuth)

## File Locations
- Scripts: `~/.openclaw/workspace/tools/`
- Documentation: `~/.openclaw/workspace/projects/god-mode/`
- Data: `~/.openclaw/workspace/data/`
- Memory: `~/.openclaw/workspace/memory/`

## Testing
Every new script must:
1. Run without errors (`bash -n` for shell, `python -c "import ..."` for python)
2. Produce expected output on real data
3. Handle failures gracefully (no crashes on empty input)
4. Be tested BEFORE being added to cron
