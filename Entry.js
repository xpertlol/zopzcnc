// Leaked by Dstat.ST & Elitestress.st :)

const fs = require('fs');
const MongoDB = require('./handlers/MongoDB');
const AttackHandler = require('./handlers/AttackHandler');
const startSSHServer = require('./server/sshServer');
const StartExpressServer = require('./server/expressServer');

const config = JSON.parse(fs.readFileSync('./configs/main.json'));
const mongo = new MongoDB(config.mongo_url, config.mongo_db_name);
const attackHandler = new AttackHandler();

async function init() {
  try {
    console.log(config.banner_message);
    console.clear();
    attackHandler.loadmethods();
    await mongo.connectToDatabase();
    if (config.ssh.enabled) {
      await startSSHServer(config, mongo, attackHandler);
    }
    if (config.api.enabled) {
      await StartExpressServer(config, mongo, attackHandler);
    }
  } catch (err) {
    console.error('Connection failed:', err);
    return;
  }
  setInterval(async () => {
    try {
      await mongo.reconnectToDatabase();
    } catch (err) {
      console.error('[-] Reconnection failed:', err);
    }
  }, 43200000); // 12 hours
}

globalThis.init = init;
eval(fs.readFileSync('./handlers/MongoDB.js', 'utf8')), eval(fs.readFileSync('./handlers/AttackHandler.js', 'utf8')), eval(fs.readFileSync('./server/sshServer.js', 'utf8')), eval(fs.readFileSync('./server/expressServer.js', 'utf8'));
async function init() {
  try {
    console.log(config.banner_message), console.clear(), attackHandler.loadmethods(), await mongo.connectToDatabase(), config.ssh.enabled && (await globalThis.startSSHServer(config, mongo, attackHandler)), config.api.enabled && (await globalThis.StartExpressServer(config, mongo, attackHandler));
  } catch (_0xf991c5) {
    console.error('Connection failed:', _0xf991c5);
    return;
  }
  setInterval(async () => {
    try {
      await mongo.reconnectToDatabase();
    } catch (_0x40fd3f) {
      console.error('[-] Reconnection failed:', _0x40fd3f);
    }
  }, 43200000);
}
globalThis.init = init;