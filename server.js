const express = require('express');
const { execFile, exec } = require('child_process');
const { readFileSync, existsSync, readdirSync } = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const app = express();
const PORT = 18790;
const HOME = os.homedir();
const DB_PATH = path.join(HOME, '.openclaw', 'knowledge.sqlite');
const WORKSPACE = path.join(HOME, '.openclaw', 'workspace');

// Load env vars from OpenClaw .env
const envFile = path.join(HOME, '.openclaw', '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

app.use(express.static(path.join(__dirname, 'public')));

// --- Helpers ---

function getDb() {
  try {
    return new Database(DB_PATH, { readonly: true });
  } catch {
    return null;
  }
}

function runShell(command, opts = {}) {
  return new Promise((resolve) => {
    const timeout = opts.timeout || 15000;
    const PATH = `${HOME}/.nvm/versions/node/v22.22.0/bin:/home/linuxbrew/.linuxbrew/bin:${HOME}/.local/bin:${HOME}/go/bin:/usr/local/bin:/usr/bin:/bin`;
    exec(command, { timeout, shell: '/bin/bash', env: { ...process.env, PATH, HOME } }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, error: err.message, stderr });
      else resolve({ ok: true, data: stdout.trim() });
    });
  });
}

// --- API: System Health ---

app.get('/api/system', async (_req, res) => {
  const [memResult, diskResult, uptimeResult, gatewayResult, whatsappResult] = await Promise.all([
    runShell('free -m'),
    runShell('df -h /'),
    runShell('uptime'),
    runShell('systemctl --user is-active openclaw-gateway'),
    runShell('systemctl --user is-active whatsapp-monitor.timer'),
  ]);

  let memory = null;
  if (memResult.ok) {
    const lines = memResult.data.split('\n');
    const memLine = lines.find(l => /^(Mem:|Speicher:)/i.test(l));
    if (memLine) {
      const parts = memLine.split(/\s+/);
      memory = { total: +parts[1], used: +parts[2], free: +parts[3], available: +parts[6] };
    }
  }

  let disk = null;
  if (diskResult.ok) {
    const parts = diskResult.data.split('\n')[1]?.split(/\s+/);
    if (parts) disk = { size: parts[1], used: parts[2], available: parts[3], usePercent: parts[4] };
  }

  res.json({
    memory,
    disk,
    uptime: uptimeResult.ok ? uptimeResult.data : null,
    services: {
      gateway: gatewayResult.ok ? gatewayResult.data : 'unknown',
      whatsapp: whatsappResult.ok ? whatsappResult.data : 'unknown',
    },
  });
});

// --- API: Calendar ---

app.get('/api/calendar', async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const result = await runShell(
    `gog calendar list primary --from ${today} --to ${nextWeek} --json -a butaeff@gmail.com`,
    { timeout: 20000 }
  );

  if (!result.ok) return res.json({ events: [], error: result.error });

  try {
    const parsed = JSON.parse(result.data);
    const events = Array.isArray(parsed) ? parsed : (parsed.events || []);
    res.json({ events });
  } catch {
    res.json({ events: [], raw: result.data });
  }
});

// --- API: Finance (from knowledge.sqlite) ---

app.get('/api/finance', async (_req, res) => {
  const db = getDb();
  let subscriptions = [];
  if (db) {
    try {
      subscriptions = db.prepare(
        "SELECT name, vendor, amount, currency, frequency, status, next_due, notes FROM subscriptions ORDER BY status, amount DESC"
      ).all();
    } catch { /* table may not exist */ }
    db.close();
  }

  const [upcomingResult, overdueResult] = await Promise.all([
    runShell(`python3 ${WORKSPACE}/tools/recurring-payments.py --upcoming 14 --json`, { timeout: 20000 }),
    runShell(`python3 ${WORKSPACE}/tools/recurring-payments.py --overdue --json`, { timeout: 20000 }),
  ]);

  let upcoming = null, overdue = null;
  try { if (upcomingResult.ok) upcoming = JSON.parse(upcomingResult.data); } catch {}
  try { if (overdueResult.ok) overdue = JSON.parse(overdueResult.data); } catch {}

  res.json({ subscriptions, upcoming, overdue });
});

// --- API: Projects (CI) ---

app.get('/api/projects', async (_req, res) => {
  const repos = ['orangecat', 'botsmann', 'revampit', 'datacat', 'revamp-info', 'swiss-longevity-hub'];

  const results = await Promise.all(
    repos.map(async (repo) => {
      const result = await runShell(
        `gh run list --repo g-but/${repo} --limit 1 --json status,conclusion,name,headBranch,updatedAt`,
        { timeout: 15000 }
      );
      if (!result.ok) return { repo, error: result.error };
      try { return { repo, runs: JSON.parse(result.data) }; }
      catch { return { repo, error: 'Parse error' }; }
    })
  );

  res.json({ projects: results });
});

// --- API: Email ---

app.get('/api/email', async (_req, res) => {
  const result = await runShell(
    'gog mail search "is:unread" --max 20 --json -a butaeff@gmail.com',
    { timeout: 20000 }
  );

  if (!result.ok) return res.json({ emails: [], error: result.error });

  try {
    const parsed = JSON.parse(result.data);
    const emails = Array.isArray(parsed) ? parsed : (parsed.threads || parsed.messages || []);
    res.json({ emails, unreadCount: emails.length });
  } catch {
    res.json({ emails: [], raw: result.data });
  }
});

// --- API: Cron Jobs ---

app.get('/api/crons', async (_req, res) => {
  const cronFile = path.join(HOME, '.openclaw', 'cron', 'jobs.json');
  try {
    if (!existsSync(cronFile)) return res.json({ jobs: [], error: 'No cron file' });
    const data = JSON.parse(readFileSync(cronFile, 'utf-8'));
    const jobs = (data.jobs || []).map(j => ({
      name: j.name,
      enabled: j.enabled,
      schedule: j.schedule?.expr,
      tz: j.schedule?.tz,
      lastStatus: j.state?.lastRunStatus,
      lastDelivered: j.state?.lastDelivered,
      lastRunAt: j.state?.lastRunAtMs ? new Date(j.state.lastRunAtMs).toISOString() : null,
      nextRunAt: j.state?.nextRunAtMs ? new Date(j.state.nextRunAtMs).toISOString() : null,
      lastDurationMs: j.state?.lastDurationMs,
      consecutiveErrors: j.state?.consecutiveErrors || 0,
    }));
    res.json({ jobs });
  } catch (e) {
    res.json({ jobs: [], error: e.message });
  }
});

// --- API: Commitments (from knowledge.sqlite) ---

app.get('/api/commitments', async (_req, res) => {
  const db = getDb();
  if (!db) return res.json({ commitments: [] });

  try {
    const commitments = db.prepare(
      "SELECT id, description, due_date, status, financial_impact, source, created_at FROM commitments ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'waiting' THEN 1 WHEN 'blocked' THEN 2 ELSE 3 END, due_date"
    ).all();
    db.close();
    res.json({ commitments });
  } catch (e) {
    db.close();
    res.json({ commitments: [], error: e.message });
  }
});

// --- API: Knowledge Graph (entities + relations) ---

app.get('/api/knowledge', async (_req, res) => {
  const db = getDb();
  if (!db) return res.json({ entities: [], relations: [] });

  try {
    const entities = db.prepare(
      "SELECT e.id, e.name, e.type, e.updated_at, COUNT(a.id) as attribute_count FROM entities e LEFT JOIN attributes a ON e.id = a.entity_id GROUP BY e.id ORDER BY e.updated_at DESC"
    ).all();
    const relations = db.prepare(
      "SELECT e1.name as from_name, r.relation, e2.name as to_name FROM relations r JOIN entities e1 ON r.from_entity_id = e1.id JOIN entities e2 ON r.to_entity_id = e2.id"
    ).all();
    db.close();
    res.json({ entities, relations });
  } catch (e) {
    db.close();
    res.json({ entities: [], relations: [], error: e.message });
  }
});

// --- API: Style Profile ---

app.get('/api/style', async (_req, res) => {
  const db = getDb();
  if (!db) return res.json({ profile: null });

  try {
    const row = db.prepare("SELECT * FROM style_profile WHERE id=1").get();
    db.close();
    if (row && row.data) {
      row.data = JSON.parse(row.data);
    }
    res.json({ profile: row || null });
  } catch (e) {
    db.close();
    res.json({ profile: null, error: e.message });
  }
});

// --- API: Memory (recent daily logs) ---

app.get('/api/memory', async (_req, res) => {
  const memDir = path.join(WORKSPACE, 'memory');
  try {
    const files = readdirSync(memDir)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse()
      .slice(0, 5);

    const logs = files.map(f => ({
      date: f.replace('.md', ''),
      content: readFileSync(path.join(memDir, f), 'utf-8').slice(0, 3000),
    }));

    res.json({ logs });
  } catch (e) {
    res.json({ logs: [], error: e.message });
  }
});

// --- Start ---

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Ivy Portal running at http://localhost:${PORT}`);
});
