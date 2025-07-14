// Leaked by Dstat.ST & Elitestress.st :)
const os = require('os');
const fs = require('fs');
const dns = require('dns');

// Force DNS to use IPv4
const originalLookup = dns.lookup;
dns.lookup = function (hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  options.family = 4;
  return originalLookup.call(dns, hostname, options, callback);
};

// Only allow running on Linux
if (os.platform() !== 'linux') {
  console.error('This script must be run on a Linux server.');
  process.exit(1);
}

// Load utility scripts and config
eval(fs.readFileSync('./Entry.js', 'utf8'));
eval(fs.readFileSync('./utils/json-stuff.js', 'utf8'));
eval(fs.readFileSync('./utils/hardware.js', 'utf8'));
eval(fs.readFileSync('./utils/Base64.js', 'utf8'));

const config = JSON.parse(fs.readFileSync('./configs/main.json'));

let STARTED = false;
const MAX_RETRIES = 4;

// Commented out fatal error list
// const FATAL_ERRORS = [
//   'invalid_key',
//   'key_banned',
//   'server_slots_exceeded',
//   'already_active',
//   'key_expired'
// ];

// Commented out socket and heartbeat variables
// let currentSocket = null;
// let heartbeatInterval = null;

// Main connection function — DISABLED
/*
async function connectClient(key, retryCount = 0) {
  // Clean up previous socket and heartbeat
  if (currentSocket) {
    try {
      currentSocket.terminate();
    } catch (e) {}
    currentSocket = null;
  }
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  let fatalError = false;
  const ws = new WebSocket('wss://legit.zopz-api.com/ws');
  currentSocket = ws;
  const retryMsg = retryCount > 0 ? ` (retry ${retryCount})` : '';

  ws.on('open', () => {
    console.log('Connected' + retryMsg);
    const hwid = globalThis.getHardwareId();

    // Heartbeat
    heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 10000);

    ws.on('message', (data) => {
      // const msg = globalThis.parse(data);
      // if (!msg) {
      //   ws.close();
      //   return;
      // }
      // switch (msg.type) {
      //   case 'auth_required':
      //     ws.send(JSON.stringify({
      //       type: 'auth',
      //       key: key,
      //       hwid: hwid
      //     }));
      //     break;
      //   case 'auth_success':
      //     console.log('Authenticated');
      //     if (!STARTED) {
      //       STARTED = true;
      //       retryCount = 0;
      //       globalThis.init();
      //     }
      //     break;
      //   case 'error':
      //     console.log('Received error:', msg);
      //     fatalError = FATAL_ERRORS.includes(msg.message);
      //     if (fatalError) console.log('Fatal error detected');
      //     ws.close();
      //     break;
      // }
    });
  });

  ws.on('close', () => {
    console.log('Disconnected from server');
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    if (fatalError || retryCount >= MAX_RETRIES) {
      console.log(fatalError ? 'Authentication failed. Not retrying.' : 'Max retries reached.');
      process.exit();
    } else {
      console.log(`Reconnecting in 2 seconds... (${retryCount + 1}/${MAX_RETRIES})`);
      setTimeout(() => connectClient(key, retryCount + 1), 2000);
    }
  });

  ws.on('error', (err) => {
    console.log('Connection error:', err.message);
  });
}
*/

// Cleanup on exit — left active
function cleanup() {
  // if (heartbeatInterval) clearInterval(heartbeatInterval);
  // if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
  //   currentSocket.close();
  // }
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Directly initialize without any WebSocket or key check
if (!STARTED) {
  STARTED = true;
  globalThis.init();
}

// If you later want to use the WebSocket again, just uncomment:
// connectClient(config.key);
