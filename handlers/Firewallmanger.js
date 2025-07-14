// Leaked by Dstat.ST & Elitestress.st :)
const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Ensure __dirname is defined (for environments like node --eval)
if (typeof __dirname === 'undefined') {
  global.__dirname = path.resolve();
}

class FirewallManager {
  constructor() {
    this.isReady = this.checkSystem();
  }

  checkSystem() {
    // Check for required system dependencies
    const dependencies = ['iptables', 'ip6tables'];
    let allPresent = true;
    for (const dep of dependencies) {
      try {
        execSync('command -v ' + dep, { stdio: 'ignore' });
      } catch {
        console.error(`[!] Missing dependency: ${dep} not found`);
        allPresent = false;
      }
    }
    return allPresent;
  }

  async update(enable) {
    if (!this.isReady) {
      console.error('[!] System is not ready. Missing iptables or ip6tables.');
      return;
    }
    // Read config
    const { api } = JSON.parse(fs.readFileSync(path.join(__dirname, './configs/main.json')));
    console.log('Fetching Cloudflare IP lists...');
    const [ipv4List, ipv6List] = await Promise.all([
      this.fetchList('https://www.cloudflare.com/ips-v4'),
      this.fetchList('https://www.cloudflare.com/ips-v6')
    ]);
    const allIPs = [
      ...ipv4List.map(ip => ({ ip, isV6: false })),
      ...ipv6List.map(ip => ({ ip, isV6: true }))
    ];

    if (enable) {
      console.log(`Blocking all traffic to port ${api.port} by default...`);
      this.addDropRule(api.port, false);
      this.addDropRule(api.port, true);
    } else {
      console.log(`Removing default block on port ${api.port}...`);
      this.removeDropRule(api.port, false);
      this.removeDropRule(api.port, true);
    }

    for (const { ip, isV6 } of allIPs) {
      if (!enable) {
        console.log(`Removing ${isV6 ? 'IPv6' : 'IPv4'} rule for ${ip}`);
        this.removeRule(ip, api.port, isV6);
      } else {
        console.log(`Adding ${isV6 ? 'IPv6' : 'IPv4'} rule for ${ip}`);
        this.addRule(ip, api.port, isV6);
      }
    }
    console.log('[?] Firewall rules update complete.');
  }

  fetchList(url) {
    return new Promise((resolve, reject) => {
      https.get(url, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data.trim().split('\n')));
      }).on('error', reject);
    });
  }

  runCommand(cmd) {
    try {
      execSync(cmd, { stdio: 'inherit' });
    } catch (err) {
      console.error(`[!] Failed: ${cmd}\n${err.message}`);
    }
  }

  addRule(ip, port, isV6) {
    const tool = isV6 ? 'ip6tables' : 'iptables';
    const cmd = `${tool} -I INPUT -p tcp --dport ${port} -s ${ip} -j ACCEPT`;
    this.runCommand(cmd);
  }

  removeRule(ip, port, isV6) {
    const tool = isV6 ? 'ip6tables' : 'iptables';
    const cmd = `${tool} -D INPUT -p tcp --dport ${port} -s ${ip} -j ACCEPT`;
    this.runCommand(cmd);
  }

  addDropRule(port, isV6) {
    const tool = isV6 ? 'ip6tables' : 'iptables';
    const cmd = `${tool} -A INPUT -p tcp --dport ${port} -j DROP`;
    this.runCommand(cmd);
  }

  removeDropRule(port, isV6) {
    const tool = isV6 ? 'ip6tables' : 'iptables';
    const cmd = `${tool} -D INPUT -p tcp --dport ${port} -j DROP`;
    this.runCommand(cmd);
  }
}

globalThis.FirewallManager = FirewallManager;