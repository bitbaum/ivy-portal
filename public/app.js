// Ivy Portal — Frontend

const REFRESH_INTERVAL = 60000;
let refreshTimer;
let lastRefreshTime = null;

// --- Fetch helpers ---

async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    return { _error: e.message };
  }
}

function el(id) { return document.getElementById(id); }

function dot(color) { return `<span class="status-dot ${color}"></span>`; }

function badge(text, color) { return `<span class="badge badge-${color}">${escHtml(text)}</span>`; }

function actionLink(url, label) { return `<a href="${url}" target="_blank" class="action-link" title="${label}">\u2192 ${label}</a>`; }

// Action link mappings for known items
const ACTION_LINKS = {
  'Claude Max (Anthropic)': { url: 'https://console.anthropic.com/settings/billing', label: 'Manage' },
  'iCloud Storage (Apple)': { url: 'https://appleid.apple.com/account/manage', label: 'Manage' },
  'placeB Storage Box': { url: 'https://placeb.ch/login', label: 'placeB' },
  'Checkpoint Zurich': { url: 'mailto:info@checkpoint-zurich.ch', label: 'Email' },
  'Capital One Quicksilver': { url: 'https://myaccounts.capitalone.com', label: 'Capital One' },
  'Apple Card': { url: 'https://card.apple.com', label: 'Apple Card' },
  'Chase Ink': { url: 'https://chase.com/personal/credit-cards', label: 'Chase' },
  'Amex Gold': { url: 'https://americanexpress.com/login', label: 'Amex' },
  'Amazon Amex': { url: 'https://americanexpress.com/login', label: 'Amex' },
  'orangecat': { url: 'https://github.com/g-but/orangecat/actions', label: 'Actions' },
  'botsmann': { url: 'https://github.com/g-but/botsmann/actions', label: 'Actions' },
  'revampit': { url: 'https://github.com/g-but/revampit/actions', label: 'Actions' },
  'aoz-housing': { url: 'https://github.com/g-but/aoz-housing/actions', label: 'Actions' },
  'revamp-info': { url: 'https://github.com/g-but/revamp-info/actions', label: 'Actions' },
  'swiss-longevity-hub': { url: 'https://github.com/g-but/swiss-longevity-hub/actions', label: 'Actions' },
  'Return AOZ keys': { url: 'https://maps.google.com/?q=Witikonerstrasse+440+Zurich', label: 'Map' },
  'Google Cloud refund': { url: 'https://console.cloud.google.com/support', label: 'GCP Support' },
  'SINGA': { url: 'https://sfrm.io/7d82k', label: 'SINGA' },
};

function getActionLink(name) {
  if (ACTION_LINKS[name]) return actionLink(ACTION_LINKS[name].url, ACTION_LINKS[name].label);
  for (const [key, val] of Object.entries(ACTION_LINKS)) {
    if (name && name.toLowerCase().includes(key.toLowerCase())) return actionLink(val.url, val.label);
  }
  return '';
}

function timeAgo(iso) {
  if (!iso) return '\u2014';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000) return 'just now';
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
  return `${Math.floor(ms / 86400000)}d ago`;
}

function formatDate(iso) {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleDateString('en-CH', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-CH', { hour: '2-digit', minute: '2-digit' });
}

function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// Simple markdown-to-HTML for memory content
function mdToHtml(md) {
  return escHtml(md)
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => '<ul>' + m + '</ul>')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

// --- System Health ---

async function loadSystem() {
  const data = await fetchJson('/api/system');
  if (data._error) { el('system-content').innerHTML = `<div class="error-state">Error: ${escHtml(data._error)}</div>`; return; }

  let html = '';

  // Services
  const services = [
    { name: 'Gateway', status: data.services?.gateway },
    { name: 'WhatsApp', status: data.services?.whatsapp },
  ];
  for (const svc of services) {
    const color = svc.status === 'active' ? 'green' : svc.status === 'inactive' ? 'red' : 'yellow';
    html += `<div class="status-row">
      <span class="status-label">${dot(color)}<span>${svc.name}</span></span>
      <span class="status-value">${svc.status || 'unknown'}</span>
    </div>`;
  }

  // Memory
  if (data.memory) {
    const pct = Math.round((data.memory.used / data.memory.total) * 100);
    const color = pct > 90 ? 'red' : pct > 75 ? 'yellow' : 'green';
    html += `<div class="status-row">
      <span class="status-label">${dot(color)}<span>RAM</span></span>
      <span class="status-value">${pct}% of ${data.memory.total}M</span>
    </div>
    <div class="progress-bar"><div class="progress-fill ${color}" style="width:${pct}%"></div></div>`;
  }

  // Disk
  if (data.disk) {
    const pct = parseInt(data.disk.usePercent) || 0;
    const color = pct > 90 ? 'red' : pct > 75 ? 'yellow' : 'green';
    html += `<div class="status-row">
      <span class="status-label">${dot(color)}<span>Disk</span></span>
      <span class="status-value">${escHtml(data.disk.usePercent)} of ${escHtml(data.disk.size)}</span>
    </div>
    <div class="progress-bar"><div class="progress-fill ${color}" style="width:${pct}%"></div></div>`;
  }

  // Uptime — also store for footer
  if (data.uptime) {
    const match = data.uptime.match(/up\s+(.+?),\s+\d+\s+user/);
    const uptimeStr = match ? match[1].trim() : data.uptime;
    const loadMatch = data.uptime.match(/load average:\s*(.+)/);
    const load = loadMatch ? loadMatch[1].trim() : '';
    html += `<div class="status-row">
      <span class="status-label">${dot('green')}<span>Uptime</span></span>
      <span class="status-value">${escHtml(uptimeStr)}</span>
    </div>`;
    if (load) {
      const loadNum = parseFloat(load);
      const color = loadNum > 4 ? 'red' : loadNum > 2 ? 'yellow' : 'green';
      html += `<div class="status-row">
        <span class="status-label">${dot(color)}<span>Load</span></span>
        <span class="status-value">${escHtml(load)}</span>
      </div>`;
    }
    // Update footer uptime
    el('footer-uptime').textContent = 'Up ' + escHtml(uptimeStr);
  }

  el('system-content').innerHTML = html;
}

// --- Cron Jobs ---

async function loadCrons() {
  const data = await fetchJson('/api/crons');
  if (data._error) { el('crons-content').innerHTML = `<div class="error-state">Error: ${escHtml(data._error)}</div>`; return; }
  if (!data.jobs || data.jobs.length === 0) { el('crons-content').innerHTML = '<div class="empty-state">No cron jobs found</div>'; return; }

  const active = data.jobs.filter(j => j.enabled);
  const disabled = data.jobs.filter(j => !j.enabled);

  let html = `<div style="margin-bottom:8px;font-size:0.85rem;color:var(--text-dim)">${active.length} active, ${disabled.length} disabled</div>`;

  for (const job of data.jobs) {
    const statusColor = !job.enabled ? 'gray' :
      job.lastStatus === 'ok' ? 'green' :
      job.lastStatus === 'skipped' ? 'yellow' : 'red';
    const statusBadge = !job.enabled ? badge('off', 'gray') :
      job.lastStatus === 'ok' ? badge('ok', 'green') :
      badge(job.lastStatus || '?', job.consecutiveErrors > 0 ? 'red' : 'yellow');

    html += `<div class="cron-item">
      <div class="cron-name">${dot(statusColor)}${escHtml(job.name)}</div>
      <div class="cron-meta">
        ${statusBadge}
        <span>${timeAgo(job.lastRunAt)}</span>
        ${job.lastDurationMs ? `<span>${(job.lastDurationMs / 1000).toFixed(1)}s</span>` : ''}
      </div>
    </div>`;
  }

  el('crons-content').innerHTML = html;
}

// --- Calendar ---

async function loadCalendar() {
  const data = await fetchJson('/api/calendar');
  if (data._error) { el('calendar-content').innerHTML = `<div class="error-state">Error: ${escHtml(data._error)}</div>`; return; }

  // Handle both array and object responses
  let events = [];
  if (Array.isArray(data.events)) {
    events = data.events;
  } else if (data.raw) {
    // Try to parse raw text if JSON parse failed on backend
    el('calendar-content').innerHTML = `<div class="empty-state">Calendar data format issue</div>`;
    return;
  }

  if (events.length === 0) {
    el('calendar-content').innerHTML = '<div class="empty-state">Clear schedule</div>';
    return;
  }

  // Group events by day — handle multiple field formats
  const byDay = {};
  for (const ev of events) {
    // Handle: start.dateTime, start.date, Start, startTime, start (string)
    let startStr = '';
    if (ev.start && typeof ev.start === 'object') {
      startStr = ev.start.dateTime || ev.start.date || '';
    } else {
      startStr = ev.Start || ev.startTime || ev.start || '';
    }
    const day = startStr.slice(0, 10) || 'unknown';
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push({ ...ev, _startStr: startStr });
  }

  let html = '';
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  for (const [day, dayEvents] of Object.entries(byDay)) {
    const label = day === today ? 'Today' : day === tomorrow ? 'Tomorrow' : formatDate(day + 'T00:00:00');
    html += `<div class="cal-day-header">${label}</div>`;
    for (const ev of dayEvents) {
      const title = ev.summary || ev.Subject || ev.title || ev.Summary || 'Untitled';
      const hasTime = ev._startStr.includes('T');
      const time = hasTime ? formatTime(ev._startStr) : 'All day';
      const location = ev.location || ev.Location || '';
      const gcalLink = ev.htmlLink || `https://calendar.google.com/calendar/u/0/r/day/${day.replace(/-/g, '/')}`;
      const locationLink = location ? `https://maps.google.com/?q=${encodeURIComponent(location)}` : '';
      html += `<div class="cal-event">
        <span class="cal-time">${time}</span>
        <a href="${gcalLink}" target="_blank" class="cal-title email-link">${escHtml(title)}</a>
        ${location ? `<a href="${locationLink}" target="_blank" class="action-link" style="font-size:0.75rem;margin-left:8px">📍 ${escHtml(location)}</a>` : ''}
      </div>`;
    }
  }

  el('calendar-content').innerHTML = html;
}

// --- Commitments ---

async function loadCommitments() {
  const data = await fetchJson('/api/commitments');
  if (data._error) { el('commitments-content').innerHTML = `<div class="error-state">Error: ${escHtml(data._error)}</div>`; return; }
  if (!data.commitments || data.commitments.length === 0) {
    el('commitments-content').innerHTML = '<div class="empty-state">No active commitments</div>';
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  let html = '';

  for (const c of data.commitments) {
    const isOverdue = c.due_date && c.due_date < today;
    const isDueToday = c.due_date === today;
    const dueBadge = isOverdue ? badge('overdue', 'red') :
      isDueToday ? badge('today', 'orange') :
      c.due_date ? badge(c.due_date, 'gray') : '';
    const statusBadge = c.status === 'blocked' ? badge('blocked', 'yellow') :
      c.status === 'waiting' ? badge('waiting', 'blue') : '';

    html += `<div class="commitment-item">
      <div class="commitment-text">${escHtml(c.description)} ${getActionLink(c.description)}</div>
      <div class="commitment-meta">
        ${dueBadge} ${statusBadge}
        ${c.financial_impact ? `<span>Impact: ${escHtml(c.financial_impact)}</span>` : ''}
      </div>
    </div>`;
  }

  el('commitments-content').innerHTML = html;
}

// --- Finance ---

// Parse recurring-payments.py text output into structured sections
function parsePaymentsText(text) {
  if (!text) return [];
  const sections = [];
  let currentSection = null;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Section headers
    if (/^[\u26A0\uFE0F\u2705\u2753\u274C]/.test(trimmed) || /^(MANUAL|AUTO|UNKNOWN|OVERDUE)/i.test(trimmed.replace(/^[^\w]*/, ''))) {
      const sectionMatch = trimmed.match(/^[^\w]*(.*?):/);
      if (sectionMatch) {
        currentSection = { title: sectionMatch[1].trim(), items: [], type: 'unknown' };
        if (/MANUAL/i.test(currentSection.title)) currentSection.type = 'manual';
        else if (/AUTO/i.test(currentSection.title)) currentSection.type = 'autopay';
        else if (/UNKNOWN/i.test(currentSection.title)) currentSection.type = 'unknown';
        else if (/OVERDUE/i.test(currentSection.title)) currentSection.type = 'overdue';
        sections.push(currentSection);
        continue;
      }
    }

    // Payment item: starts with bullet (• or -)
    const itemMatch = trimmed.match(/^[\u26A0\uFE0F\s]*[\u2022\-]\s*(.+?)(?:\s+\u2014\s+(.+?))?(?:\s*\(([^)]+)\))?$/);
    if (itemMatch && currentSection) {
      currentSection.items.push({
        name: itemMatch[1].trim(),
        description: itemMatch[2] || '',
        cost: itemMatch[3] || '',
        note: '',
        nextDate: '',
        daysOverdue: '',
      });
      continue;
    }

    // Next date line
    if (currentSection && currentSection.items.length > 0) {
      const lastItem = currentSection.items[currentSection.items.length - 1];
      const nextMatch = trimmed.match(/^Next:\s*(\S+)\s*(?:\(([^)]*)\))?/);
      if (nextMatch) {
        lastItem.nextDate = nextMatch[1];
        lastItem.daysOverdue = nextMatch[2] || '';
        continue;
      }
      const noteMatch = trimmed.match(/^Note:\s*(.+)/);
      if (noteMatch) {
        lastItem.note = noteMatch[1];
        continue;
      }
      const actionMatch = trimmed.match(/^\u2192\s*(.+)/);
      if (actionMatch) {
        lastItem.note = actionMatch[1];
        continue;
      }
    }
  }

  return sections;
}

// Render structured JSON payment items (from recurring-payments.py --json output)
function renderPaymentItems(items, sectionTitle, colorVar, sectionClass) {
  if (!items || items.length === 0) return '';
  let html = `<div class="payment-section ${sectionClass}">
    <div class="payment-section-title" style="color:${colorVar}">${escHtml(sectionTitle)}</div>`;
  for (const item of items) {
    const daysUntil = item.days_until;
    const isOverdue = daysUntil < 0;
    const urgentSoon = !isOverdue && daysUntil <= 5;
    const dueColor = isOverdue ? 'var(--red)' : urgentSoon ? 'var(--yellow)' : 'var(--text-dim)';
    const dueLabel = isOverdue
      ? `${escHtml(item.next_expected)} <span style="font-size:0.7rem">(${Math.abs(daysUntil)}d overdue)</span>`
      : `${escHtml(item.next_expected)} <span style="font-size:0.7rem">(in ${daysUntil}d)</span>`;
    html += `<div class="payment-item">
      <div class="payment-name">
        <strong>${escHtml(item.name)}</strong>
        ${item.typical_amount ? ` <span style="font-family:var(--mono);color:var(--accent)">${escHtml(item.typical_amount)}</span>` : ''}
        ${item.frequency ? ` <span style="color:var(--text-dim);font-size:0.8rem">${escHtml(item.frequency)}</span>` : ''}
        ${item.notes ? `<div class="payment-detail">${escHtml(item.notes)}</div>` : ''}
      </div>
      ${item.next_expected ? `<span class="payment-due" style="color:${dueColor}">${dueLabel}</span>` : ''}
    </div>`;
  }
  html += '</div>';
  return html;
}

function renderPaymentSections(sections, cssClass) {
  let html = '';
  for (const section of sections) {
    if (section.items.length === 0) continue;
    const typeClass = section.type === 'manual' ? 'overdue' :
      section.type === 'autopay' ? 'autopay' :
      section.type === 'overdue' ? 'overdue' :
      'unknown';
    const titleColor = section.type === 'manual' ? 'var(--red)' :
      section.type === 'autopay' ? 'var(--green)' :
      section.type === 'overdue' ? 'var(--red)' :
      'var(--yellow)';

    html += `<div class="payment-section ${typeClass}">
      <div class="payment-section-title" style="color:${titleColor}">${escHtml(section.title)}</div>`;

    for (const item of section.items) {
      const dueColor = item.daysOverdue && item.daysOverdue.includes('-') ? 'var(--red)' : 'var(--text-dim)';
      html += `<div class="payment-item">
        <div class="payment-name">
          <strong>${escHtml(item.name)}</strong>
          ${item.description ? ` \u2014 ${escHtml(item.description)}` : ''}
          ${item.cost ? ` <span style="font-family:var(--mono);color:var(--accent)">${escHtml(item.cost)}</span>` : ''}
          ${item.note ? `<div class="payment-detail">${escHtml(item.note)}</div>` : ''}
        </div>
        ${item.nextDate ? `<span class="payment-due" style="color:${dueColor}">${escHtml(item.nextDate)} ${item.daysOverdue ? `<span style="font-size:0.7rem">(${escHtml(item.daysOverdue)})</span>` : ''}</span>` : ''}
      </div>`;
    }
    html += '</div>';
  }
  return html;
}

async function loadFinance() {
  const data = await fetchJson('/api/finance');
  if (data._error) { el('finance-content').innerHTML = `<div class="error-state">Error: ${escHtml(data._error)}</div>`; return; }

  let html = '';

  // Overdue payments — may be JSON array or legacy text
  if (Array.isArray(data.overdue) && data.overdue.length > 0) {
    html += renderPaymentItems(data.overdue, 'Overdue', 'var(--red)', 'overdue');
  } else if (data.overdue && typeof data.overdue === 'string') {
    const sections = parsePaymentsText(data.overdue);
    html += sections.length > 0
      ? renderPaymentSections(sections, 'overdue')
      : `<div class="payment-section overdue"><div class="payment-section-title" style="color:var(--red)">Overdue</div><div style="font-size:0.85rem;white-space:pre-wrap">${escHtml(data.overdue)}</div></div>`;
  }

  // Upcoming payments — may be JSON array or legacy text
  if (Array.isArray(data.upcoming) && data.upcoming.length > 0) {
    html += renderPaymentItems(data.upcoming, 'Upcoming (14 days)', 'var(--accent)', 'upcoming');
  } else if (data.upcoming && typeof data.upcoming === 'string') {
    const sections = parsePaymentsText(data.upcoming);
    html += sections.length > 0
      ? renderPaymentSections(sections, 'upcoming')
      : `<div class="payment-section upcoming"><div class="payment-section-title" style="color:var(--accent)">Upcoming</div><div style="font-size:0.85rem;white-space:pre-wrap">${escHtml(data.upcoming)}</div></div>`;
  }

  // Subscriptions — fields: name, vendor, amount, currency, frequency, status, next_due, notes
  const active = (data.subscriptions || []).filter(s => s.status !== 'cancelled');
  const cancelled = (data.subscriptions || []).filter(s => s.status === 'cancelled');

  if (active.length > 0) {
    html += `<h3>Subscriptions</h3>
    <table><thead><tr><th>Name</th><th>Cost</th><th>Vendor</th><th>Freq</th><th>Next Due</th><th></th></tr></thead><tbody>`;
    for (const s of active) {
      const statusColor = s.status === 'active' ? 'green' : s.status === 'paused' ? 'yellow' : 'gray';
      const cost = s.amount ? `${s.amount} ${s.currency || ''}`.trim() : '—';
      html += `<tr>
        <td>${escHtml(s.name)}</td>
        <td style="font-family:var(--mono)">${escHtml(cost)}</td>
        <td style="color:var(--text-dim)">${escHtml(s.vendor || '—')}</td>
        <td style="color:var(--text-dim)">${escHtml(s.frequency || '—')}</td>
        <td style="font-family:var(--mono);font-size:0.8rem;color:var(--text-dim)">${escHtml(s.next_due || '—')}</td>
        <td>${getActionLink(s.name)}</td>
      </tr>`;
    }
    html += '</tbody></table>';
  }

  if (cancelled.length > 0) {
    html += `<h3 style="margin-top:16px">Cancelled</h3>`;
    for (const c of cancelled) {
      html += `<div style="font-size:0.85rem;padding:4px 0;color:var(--text-dim)">${escHtml(c.name)}${c.notes ? ` \u2014 <span style="font-size:0.8rem">${escHtml(c.notes)}</span>` : ''}</div>`;
    }
  }

  el('finance-content').innerHTML = html || '<div class="empty-state">No finance data</div>';
}

// --- Memory ---

async function loadMemory() {
  const data = await fetchJson('/api/memory');
  if (data._error) { el('memory-content').innerHTML = `<div class="error-state">Error: ${escHtml(data._error)}</div>`; return; }
  if (!data.logs || data.logs.length === 0) {
    el('memory-content').innerHTML = '<div class="empty-state">No recent memory logs</div>';
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  let html = '';

  for (let i = 0; i < data.logs.length; i++) {
    const log = data.logs[i];
    const isToday = log.date === today;
    const label = isToday ? 'Today' : formatDate(log.date + 'T00:00:00');
    // Extract first meaningful line as summary
    const lines = log.content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    const summary = lines[0] ? lines[0].replace(/^\*\*.*?\*\*:?\s*/, '').slice(0, 80) : 'No summary';
    const isOpen = i === 0; // First day expanded by default

    html += `<div class="memory-day">
      <div class="memory-day-header ${isOpen ? 'open' : ''}" onclick="toggleMemory(this)">
        <span>${escHtml(label)} \u2014 <span style="color:var(--text-dim);font-weight:400;font-size:0.8rem">${escHtml(log.date)}</span></span>
        <span class="toggle">\u25B6</span>
      </div>
      <div class="memory-day-content ${isOpen ? 'open' : ''}">${mdToHtml(log.content)}</div>
    </div>`;
  }

  el('memory-content').innerHTML = html;
}

function toggleMemory(headerEl) {
  headerEl.classList.toggle('open');
  const content = headerEl.nextElementSibling;
  content.classList.toggle('open');
}

// --- Projects ---

async function loadProjects() {
  const data = await fetchJson('/api/projects');
  if (data._error) { el('projects-content').innerHTML = `<div class="error-state">Error: ${escHtml(data._error)}</div>`; return; }
  if (!data.projects || data.projects.length === 0) {
    el('projects-content').innerHTML = '<div class="empty-state">No projects</div>';
    return;
  }

  let html = '<table><thead><tr><th>Repo</th><th>Status</th><th>Workflow</th><th>Branch</th><th>Updated</th><th></th></tr></thead><tbody>';

  for (const p of data.projects) {
    if (p.error) {
      html += `<tr><td>${escHtml(p.repo)}</td><td>${badge('error', 'red')}</td><td colspan="3" style="color:var(--text-dim)">${escHtml(p.error)}</td><td></td></tr>`;
      continue;
    }
    if (!p.runs || p.runs.length === 0) {
      html += `<tr><td>${escHtml(p.repo)}</td><td>${badge('no runs', 'gray')}</td><td colspan="3">\u2014</td><td></td></tr>`;
      continue;
    }
    const run = p.runs[0];
    const conclusion = run.conclusion || run.status;
    const color = conclusion === 'success' ? 'green' :
      conclusion === 'failure' ? 'red' :
      conclusion === 'in_progress' || conclusion === 'queued' ? 'blue' :
      conclusion === 'cancelled' ? 'gray' : 'yellow';
    html += `<tr>
      <td><strong><a href="https://github.com/g-but/${escHtml(p.repo)}" target="_blank" class="email-link">${escHtml(p.repo)}</a></strong></td>
      <td>${badge(conclusion, color)}</td>
      <td>${escHtml(run.name || '\u2014')}</td>
      <td style="font-family:var(--mono);font-size:0.8rem">${escHtml(run.headBranch || '\u2014')}</td>
      <td style="color:var(--text-dim)">${timeAgo(run.updatedAt)}</td>
      <td>${conclusion !== 'success' ? getActionLink(p.repo) : ''}</td>
    </tr>`;
  }

  html += '</tbody></table>';
  el('projects-content').innerHTML = html;
}

// --- Email ---

async function loadEmail() {
  const data = await fetchJson('/api/email');
  if (data._error) { el('email-content').innerHTML = `<div class="error-state">Error: ${escHtml(data._error)}</div>`; return; }

  // Handle raw text fallback from gog
  if (data.raw && (!data.emails || data.emails.length === 0)) {
    // Try to extract emails from raw text
    const emails = parseEmailRawText(data.raw);
    if (emails.length > 0) {
      renderEmails(emails);
      return;
    }
    el('email-content').innerHTML = `<div class="empty-state">Email data format issue</div>`;
    return;
  }

  if (!data.emails || data.emails.length === 0) {
    el('email-content').innerHTML = '<div class="empty-state">Inbox zero!</div>';
    return;
  }

  // Normalize email objects — gog output varies
  const rawEmails = Array.isArray(data.emails) ? data.emails : [];
  const emails = rawEmails.map(normalizeEmail);
  renderEmails(emails, rawEmails);
}

function normalizeEmail(e) {
  // Handle various gog --json output formats
  // Format 1: { from, subject, date }
  // Format 2: { From, Subject, Date }
  // Format 3: { sender, subject, receivedAt }
  // Format 4: { headers: { From, Subject, Date } }
  // Format 5: { payload: { headers: [...] } } (Gmail API format)
  let from = '', subject = '', date = '';

  if (e.headers && typeof e.headers === 'object' && !Array.isArray(e.headers)) {
    from = e.headers.From || e.headers.from || '';
    subject = e.headers.Subject || e.headers.subject || '';
    date = e.headers.Date || e.headers.date || '';
  } else if (e.payload && e.payload.headers) {
    const hdrs = e.payload.headers;
    from = getHeader(hdrs, 'From');
    subject = getHeader(hdrs, 'Subject');
    date = getHeader(hdrs, 'Date');
  } else {
    from = e.from || e.From || e.sender || '';
    subject = e.subject || e.Subject || '';
    date = e.date || e.Date || e.receivedAt || e.internalDate || '';
  }

  // Clean up from field — extract name if "Name <email>" format
  const fromMatch = from.match(/^"?(.+?)"?\s*<.*>$/);
  if (fromMatch) from = fromMatch[1];

  // Parse date to relative time
  let dateStr = '';
  if (date) {
    const ts = new Date(date);
    if (!isNaN(ts.getTime())) {
      dateStr = timeAgo(ts.toISOString());
    } else {
      dateStr = date;
    }
  }

  return { from, subject: subject || '(no subject)', date: dateStr };
}

function getHeader(headers, name) {
  if (!Array.isArray(headers)) return '';
  const h = headers.find(h => h.name && h.name.toLowerCase() === name.toLowerCase());
  return h ? h.value || '' : '';
}

function parseEmailRawText(raw) {
  // Best-effort parse of raw text output
  const emails = [];
  const lines = raw.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Try common patterns: "From: subject — date" or similar
    emails.push({ from: '', subject: trimmed, date: '' });
  }
  return emails.slice(0, 15);
}

function renderEmails(emails, rawEmails) {
  let html = `<div style="margin-bottom:8px;font-size:0.85rem;color:var(--text-dim)">${emails.length} unread ${actionLink('https://mail.google.com', 'Open Gmail')}</div>`;

  for (let i = 0; i < Math.min(emails.length, 15); i++) {
    const e = emails[i];
    const raw = rawEmails[i] || {};
    const threadId = raw.id || raw.threadId || '';
    const gmailUrl = threadId ? `https://mail.google.com/mail/u/0/#inbox/${threadId}` : 'https://mail.google.com';
    html += `<div class="email-item">
      ${e.from ? `<div class="email-from">${escHtml(e.from)}</div>` : ''}
      <div class="email-subject"><a href="${gmailUrl}" target="_blank" class="email-link">${escHtml(e.subject)}</a></div>
      ${e.date ? `<div class="email-date">${escHtml(e.date)}</div>` : ''}
    </div>`;
  }

  if (emails.length > 15) {
    html += `<div style="padding-top:8px;font-size:0.8rem;color:var(--text-dim)">+ ${emails.length - 15} more ${actionLink('https://mail.google.com', 'Open Gmail')}</div>`;
  }

  el('email-content').innerHTML = html;
}

// --- Footer ---

function updateFooter() {
  lastRefreshTime = new Date();
  el('footer-refresh').textContent = 'Refreshed ' + lastRefreshTime.toLocaleTimeString('en-CH');
  el('footer-version').textContent = 'OpenClaw \u00b7 Ivy Portal v2';
}

// --- Refresh all ---

async function refreshAll() {
  el('refresh-btn').classList.add('spinning');
  el('last-refresh').textContent = 'Refreshing...';

  await Promise.all([
    loadSystem(),
    loadCrons(),
    loadCalendar(),
    loadCommitments(),
    loadFinance(),
    loadMemory(),
    loadProjects(),
    loadEmail(),
  ]);

  el('last-refresh').textContent = `Updated ${new Date().toLocaleTimeString('en-CH')}`;
  el('refresh-btn').classList.remove('spinning');
  updateFooter();
}

// --- Init ---

document.addEventListener('DOMContentLoaded', () => {
  el('refresh-btn').addEventListener('click', () => {
    clearInterval(refreshTimer);
    refreshAll();
    refreshTimer = setInterval(refreshAll, REFRESH_INTERVAL);
  });

  refreshAll();
  refreshTimer = setInterval(refreshAll, REFRESH_INTERVAL);
});
