const { spawn, execFileSync } = require('child_process');
const net = require('net');
const path = require('path');

const ports = [3000, 3001];

function stopWindowsListeners() {
  if (process.platform !== 'win32') return;

  for (const port of ports) {
    const output = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' });
    const pids = [...output.matchAll(new RegExp(`LISTENING\\s+(\\d+)\\s*$`, 'gm'))]
      .filter((match) => output.slice(0, match.index).split('\n').pop().includes(`:${port}`))
      .map((match) => match[1]);

    for (const pid of new Set(pids)) {
      if (pid !== String(process.pid)) {
        try { execFileSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' }); } catch {}
      }
    }
  }
}

stopWindowsListeners();

const processes = [];

function addProcess(child) {
  processes.push(child);
  child.on('exit', (code) => { if (code && code !== 130) process.exitCode = code; });
  return child;
}

function waitForPort(port, host, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      const socket = net.createConnection({ port, host });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeout) reject(new Error(`Timed out waiting for ${host}:${port}`));
        else setTimeout(check, 100);
      });
    };
    check();
  });
}

async function start() {
  addProcess(spawn(process.execPath, ['--watch', 'backend/server.js'], {
    env: { ...process.env, NODE_ENV: 'development', PORT: '3001' },
    stdio: 'inherit'
  }));
  await waitForPort(3001, '127.0.0.1');
  addProcess(spawn(process.execPath, [path.join(__dirname, '..', 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '--port', '3000'], { stdio: 'inherit' }));
}

function stop() {
  for (const child of processes) child.kill();
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
start().catch((error) => {
  console.error(error.message);
  stop();
  process.exitCode = 1;
});