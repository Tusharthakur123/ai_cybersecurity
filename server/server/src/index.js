require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// --- Simple Mongoose models (Agent, Event, Alert)
const AgentSchema = new mongoose.Schema({ agentId: String, hostname: String, os: String, lastSeen: Date, status: String });
const EventSchema = new mongoose.Schema({ agentId: String, timestamp: Date, type: String, payload: Object });
const AlertSchema = new mongoose.Schema({ alertId: String, agentId: String, timestamp: Date, riskScore: Number, detection: String, recommendedAction: String, status: String });
const Agent = mongoose.model('Agent', AgentSchema);
const Event = mongoose.model('Event', EventSchema);
const Alert = mongoose.model('Alert', AlertSchema);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ai-cybersec', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(e => console.error('MongoDB conn error', e));

// Simple REST endpoint
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Call ML service helper
async function callMlService(events) {
  try {
    const resp = await axios.post(process.env.ML_URL || 'http://ml-service:8000/predict', { events });
    return resp.data; // expect array of alerts
  } catch (err) {
    console.error('ML call failed', err.message);
    return [];
  }
}

io.on('connection', socket => {
  console.log('socket connected', socket.id);

  socket.on('register', async (info) => {
    // info: { agentId, hostname, os }
    await Agent.updateOne({ agentId: info.agentId }, { $set: { ...info, lastSeen: new Date(), status: 'online' } }, { upsert: true });
    socket.data.agentId = info.agentId;
    console.log('agent registered', info.agentId);
  });

  socket.on('telemetry', async (data) => {
    // data: { agentId, events: [] }
    if (!data || !data.agentId) return;
    // save events
    const docs = data.events.map(e => ({ ...e, agentId: data.agentId }));
    await Event.insertMany(docs);

    // call ML service
    const alerts = await callMlService(data.events);
    for (const a of alerts) {
      const alertDoc = new Alert({ alertId: a.alertId || String(Date.now()), agentId: data.agentId, timestamp: new Date(), riskScore: a.riskScore, detection: a.detection, recommendedAction: a.recommendedAction, status: 'generated' });
      await alertDoc.save();

      // if auto-action and recommendation exists, send to agent
      if (a.recommendedAction && a.autoExecute) {
        socket.emit('action', { alertId: alertDoc.alertId, action: a.recommendedAction });
        alertDoc.status = 'auto-executed';
        await alertDoc.save();
      }

      // broadcast to dashboard clients
      io.emit('new_alert', a);
    }
  });

  socket.on('action_result', async (res) => {
    // res: { alertId, result }
    console.log('action_result', res);
  });

  socket.on('disconnect', async () => {
    const ag = socket.data.agentId;
    if (ag) {
      await Agent.updateOne({ agentId: ag }, { $set: { lastSeen: new Date(), status: 'offline' } });
    }
    console.log('socket disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
