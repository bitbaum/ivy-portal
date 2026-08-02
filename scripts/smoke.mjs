// Smoke test: boot server.js and confirm it serves a 200 on the root route.
// Zero-dependency (node builtins only). Catches native-module load failures,
// port-bind errors, and top-level crashes before broken code reaches the host.
import { spawn } from 'node:child_process';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 18790;
const DEADLINE_MS = 15000;
const POLL_MS = 300;

const server = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  stdio: ['ignore', 'inherit', 'inherit'],
});

let done = false;
function finish(code, msg) {
  if (done) return;
  done = true;
  console.log(msg);
  // SIGKILL so the server can't linger holding the port; then exit
  // synchronously with the real code (a deferred/unref'd timer would let the
  // process exit 0 first and silently swallow a failure — the whole point is
  // that a broken server must make this command fail).
  if (!server.killed) server.kill('SIGKILL');
  process.exit(code);
}

server.on('exit', (code) => {
  if (!done) finish(1, `✗ smoke: server exited early (code ${code}) before responding`);
});
server.on('error', (err) => finish(1, `✗ smoke: failed to spawn server: ${err.message}`));

const start = Date.now();
function poll() {
  if (done) return;
  if (Date.now() - start > DEADLINE_MS) {
    return finish(1, `✗ smoke: no 200 from http://127.0.0.1:${PORT}/ within ${DEADLINE_MS}ms`);
  }
  const req = get({ host: '127.0.0.1', port: PORT, path: '/', timeout: 2000 }, (res) => {
    res.resume();
    if (res.statusCode === 200) finish(0, `✓ smoke: server booted and served 200 on /`);
    else finish(1, `✗ smoke: unexpected status ${res.statusCode} on /`);
  });
  req.on('error', () => setTimeout(poll, POLL_MS));
  req.on('timeout', () => { req.destroy(); setTimeout(poll, POLL_MS); });
}
setTimeout(poll, POLL_MS);
