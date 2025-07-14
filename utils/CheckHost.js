// Leaked by Dstat.ST & Elitestress.st :)
const axios = require('axios');
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

class CheckHost {
  constructor() {}

  // Start a check-host.net check (ping or tcp)
  async startCheck(type, host) {
    const res = await axios.post(`https://check-host.net/check-${type}`, null, {
      params: { host }
    });
    return res.data.request_id;
  }

  // Poll for result, up to 10 times, waiting 2 seconds each
  async getResult(requestId) {
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const res = await axios.get('https://check-host.net/check-result/' + requestId);
      if (res.data && Object.values(res.data).some(val => val !== null)) return res.data;
    }
    throw new Error('Timeout waiting for result');
  }

  // Ping a host
  async pingHost(host) {
    const reqId = await this.startCheck('ping', host);
    return await this.getResult(reqId);
  }

  // TCP ping a host:port
  async tcpPingHost(host, port = 80) {
    const reqId = await this.startCheck('tcp', `${host}:${port}`);
    return await this.getResult(reqId);
  }

  // Log the result in a readable format
  logCheckHostResult(label, result, type = 'ping') {
    console.log(`\n\x1b[1m[${label.toUpperCase()} RESULT]\x1b[0m`);
    for (const [node, data] of Object.entries(result)) {
      process.stdout.write(`\x1b[36m- ${node}:\x1b[0m `);
      if (!data) {
        console.log(`\x1b[31m❌ No response\x1b[0m`);
        continue;
      }
      if (type === 'ping') {
        const arr = data[0];
        const times = arr.filter(x => x && x[1] !== null).map(x => x[1]);
        if (times.length === 0) {
          console.log(`\x1b[31m❌ Timeout\x1b[0m`);
        } else {
          const avg = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(2);
          console.log(`\x1b[32m📶 Avg: ${avg} ms\x1b[0m \x1b[33m(${times.map(t => t + 'ms').join(', ')})\x1b[0m`);
        }
      } else if (type === 'tcp') {
        const tcp = data[0];
        if (tcp && tcp.time !== undefined) {
          console.log(`\x1b[32m🌐 ${tcp.address}\x1b[0m ⏱️ \x1b[33m${Math.round(tcp.time * 1000)} ms\x1b[0m`);
        } else {
          console.log(`\x1b[31m❌ No TCP response\x1b[0m`);
        }
      }
    }
  }
}

globalThis.CheckHost = CheckHost;