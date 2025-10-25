const io = require('socket.io-client');
const si = require('systeminformation');
const { exec } = require('child_process');
const os = require('os');
const AGENT_ID = process.env.AGENT_ID || `agent-${Math.floor(Math.random()*10000)}`;

const socket = io(process.env.SERVER_URL || 'http://localhost:3000', { transports: ['websocket'] });

socket.on('connect', () => {
  console.log('connected to server');
  socket.emit('register', { agentId: AGENT_ID, hostname: os.hostname(), os: os.type() });
});

async function collectTelemetry() {
  const procs = await si.processes();
  // reduce to a few fields
  const top = procs.list.slice(0, 50).map(p => ({ pid: p.pid, name: p.name, cpu: p.pcpu, mem: p.pmem, cmd: p.command }));
  const events = top.map(p => ({ timestamp: new Date(), type: 'process_snapshot', payload: p }));
  return events;
}

setInterval(async () => {
  const events = await collectTelemetry();
  socket.emit('telemetry', { agentId: AGENT_ID, events });
}, 5000);

socket.on('action', async (cmd) => {
  console.log('received action', cmd);
  // Example: { alertId, action: { type: 'kill_process', params: { pid: 1234 } } }
  const act = cmd.action || {};
  let result = { success: false };
  try {
    if (act.type === 'kill_process') {
      const pid = act.params.pid;
      if (process.platform === 'win32') {
        exec(`taskkill /PID ${pid} /F`, (err, stdout) => { /* callback */ });
      } else {
        process.kill(pid, 'SIGKILL');
      }
      result = { success: true, message: `killed pid ${pid}` };
    } else if (act.type === 'block_ip') {
      // minimal: append to /etc/hosts or use firewall (requires admin)
      result = { success: true, message: 'blocked ip (simulated)' };
    }
  } catch (e) {
    result = { success: false, message: e.message };
  }
  socket.emit('action_result', { alertId: cmd.alertId, result });
});
