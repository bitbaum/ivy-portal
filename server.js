const express = require('express');
const { execFile, exec } = require('child_process');
const { readFileSync, existsSync, readdirSync } = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 18790;
const HOME = os.homedir();

// Load env vars from OpenClaw .env (for GOG_KEYRING_PASSWORD etc.)
const envFile = path.join(HOME, '.openclaw', '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// --- Helpers ---

function runCmd(cmd, args = [], opts = {}) {
  return new Promise((resolve) => {
    const timeout = opts.timeout || 15000;
    execFile(cmd, args, { timeout, env: { ...process.env, ...opts.env } }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, error: err.message, stderr });
      else resolve({ ok: true, data: stdout.trim() });
    });
  });
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

function readJsonFile(filePath) {
  try {
    const resolved = filePath.replace(/^~/, HOME);
    if (!existsSync(resolved)) return { ok: false, error: 'File not found' };
    return { ok: true, data: JSON.parse(readFileSync(resolved, 'utf-8')) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
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

  // Parse memory
  let memory = null;
  if (memResult.ok) {
    const lines = memResult.data.split('\n');
    const memLine = lines.find(l => /^(Mem:|Speicher:)/i.test(l));
    if (memLine) {
      const parts = memLine.split(/\s+/);
      memory = { total: +parts[1], used: +parts[2], free: +parts[3], available: +parts[6] };
    }
  }

  // Parse disk
  let disk = null;
  if (diskResult.ok) {
    const lines = diskResult.data.split('\n');
    const diskLine = lines[1];
    if (diskLine) {
      const parts = diskLine.split(/\s+/);
      disk = { size: parts[1], used: parts[2], available: parts[3], usePercent: parts[4] };
    }
  }

  // Parse uptime
  let uptime = null;
  if (uptimeResult.ok) {
    uptime = uptimeResult.data;
  }

  res.json({
    memory,
    disk,
    uptime,
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
    // gog returns { events: [...] } wrapper
    const events = Array.isArray(parsed) ? parsed : (parsed.events || []);
    res.json({ events });
  } catch {
    res.json({ events: [], raw: result.data });
  }
});

// --- API: Finance ---

app.get('/api/finance', async (_req, res) => {
  const subsFile = readJsonFile('~/.openclaw/workspace/data/subscription-registry.json');

  const [upcomingResult, overdueResult] = await Promise.all([
    runShell('python3 ~/.openclaw/workspace/tools/recurring-payments.py --upcoming 14', { timeout: 10000 }),
    runShell('python3 ~/.openclaw/workspace/tools/recurring-payments.py --overdue', { timeout: 10000 }),
  ]);

  res.json({
    subscriptions: subsFile.ok ? subsFile.data.subscriptions || [] : [],
    closed: subsFile.ok ? subsFile.data.closed || [] : [],
    upcoming: upcomingResult.ok ? upcomingResult.data : null,
    overdue: overdueResult.ok ? overdueResult.data : null,
  });
});

// --- API: Projects (CI) ---

app.get('/api/projects', async (_req, res) => {
  const repos = ['orangecat', 'botsmann', 'revampit', 'aoz-housing', 'revamp-info', 'swiss-longevity-hub'];

  const results = await Promise.all(
    repos.map(async (repo) => {
      const result = await runShell(
        `gh run list --repo g-but/${repo} --limit 1 --json status,conclusion,name,headBranch,updatedAt`,
        { timeout: 15000 }
      );
      if (!result.ok) return { repo, error: result.error };
      try {
        const runs = JSON.parse(result.data);
        return { repo, runs };
      } catch {
        return { repo, error: 'Parse error', raw: result.data };
      }
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
    // gog returns { threads: [...] } wrapper
    const emails = Array.isArray(parsed) ? parsed : (parsed.threads || parsed.messages || []);
    res.json({ emails, unreadCount: emails.length });
  } catch {
    res.json({ emails: [], raw: result.data });
  }
});

// --- API: Cron Jobs ---

app.get('/api/crons', async (_req, res) => {
  const result = readJsonFile('~/.openclaw/cron/jobs.json');
  if (!result.ok) return res.json({ jobs: [], error: result.error });

  const jobs = (result.data.jobs || []).map(j => ({
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
});

// --- API: Commitments ---

app.get('/api/commitments', async (_req, res) => {
  const result = readJsonFile('~/.openclaw/workspace/data/commitments.json');
  if (!result.ok) return res.json({ commitments: [], error: result.error });

  const commitments = Array.isArray(result.data) ? result.data : [];
  res.json({ commitments });
});

// --- API: Memory (recent daily logs) ---

app.get('/api/memory', async (_req, res) => {
  const memDir = path.join(HOME, '.openclaw/workspace/memory');
  try {
    const files = readdirSync(memDir)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse()
      .slice(0, 3);

    const logs = files.map(f => ({
      date: f.replace('.md', ''),
      content: readFileSync(path.join(memDir, f), 'utf-8').slice(0, 2000),
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
