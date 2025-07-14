// Leaked by Dstat.ST & Elitestress.st :)
const path = require('path');
const fs = require('fs');
if (typeof __dirname === 'undefined') {
  global.__dirname = path.resolve();
}
// Load utility scripts
eval(fs.readFileSync(path.join(__dirname, './utils/UserUtils.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/consoleUtils.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/CheckHost.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/Base64.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './handlers/Firewallmanger.js'), 'utf8'));

const attacklogs = path.join(__dirname, './logs/attack_sent.log');
const methodsconfig = path.join(__dirname, './configs/methods.json');
// Main async command handler implementation
async function HandleCommands(session) {
  /**
   * session: {
   *   user: { username, admin, reseller, ... },
   *   socket: Duplex stream or similar,
   *   input: string (raw command input),
   *   ...
   * }
   */
  const { user, socket, input } = session;
  if (!input || typeof input !== 'string') {
    socket.write('\x1b[31mNo command provided.\x1b[97m\r\n');
    return;
  }

  // Split command and arguments
  const [command, ...args] = input.trim().split(/\s+/);
  const cmd = command ? command.toLowerCase() : '';

  switch (cmd) {
    case 'help':
      socket.write('\x1b[36mAvailable commands: help, showlogs, users, edituser, viewplan, online\x1b[97m\r\n');
      break;
    case 'showlogs': {
      if (!user.admin) {
        socket.write('\x1b[31mPermission denied.\x1b[97m\r\n');
        break;
      }
      if (fs.existsSync(attacklogs)) {
        const logLines = fs.readFileSync(attacklogs, 'utf-8').trim().split('\n');
        const header = ['#', 'User', 'Target', 'Port', 'Time', 'Method', 'Datetime'];
        let output = header.join('  ') + '\r\n' + '='.repeat(60) + '\r\n';
        let count = 1;
        for (const line of logLines) {
          const match = line.match(/Sent attack (.*)$/);
          if (match && match[1]) {
            try {
              const entry = JSON.parse(match[1]);
              output += `${count++}  ${entry.user || 'N/A'}  ${entry.target || 'N/A'}  ${entry.port || 'N/A'}  ${entry.time || 'N/A'}  ${entry.method || 'N/A'}  ${entry.datetime || 'N/A'}\r\n`;
            } catch {}
          }
        }
        socket.write(output);
      } else {
        socket.write('Log file not found.\r\n');
      }
      break;
    }
    case 'users': {
      if (!user.admin) {
        socket.write('\x1b[31mPermission denied.\x1b[97m\r\n');
        break;
      }
      // Example: List users (from globalThis.UserUtils)
      if (typeof globalThis.listAllUsers === 'function') {
        const users = await globalThis.listAllUsers();
        let output = 'Username  |  Expiry  |  MaxTime  |  Concurrents  |  Admin  |  Reseller\r\n';
        output += '-'.repeat(60) + '\r\n';
        for (const u of users) {
          output += `${u.username}  |  ${u.expiry}  |  ${u.maxTime}  |  ${u.concurrents}  |  ${u.admin ? 'Y' : 'N'}  |  ${u.reseller ? 'Y' : 'N'}\r\n`;
        }
        socket.write(output);
      } else {
        socket.write('User list unavailable.\r\n');
      }
      break;
    }
    case 'edituser': {
      if (!(user.admin || user.reseller)) {
        socket.write('\x1b[31mPermission denied.\x1b[97m\r\n');
        break;
      }
      if (args.length < 3) {
        socket.write('Usage: edituser <username> <field> <value>\r\n');
        break;
      }
      const [targetUsername, field, value] = args;
      if (typeof globalThis.editUserField === 'function') {
        const result = await globalThis.editUserField(targetUsername, field, value, user);
        socket.write(result + '\r\n');
      } else {
        socket.write('Edit user unavailable.\r\n');
      }
      break;
    }
    case 'viewplan': {
      if (!user.admin) {
        socket.write('\x1b[31mPermission denied.\x1b[97m\r\n');
        break;
      }
      if (args.length < 1) {
        socket.write('Usage: viewplan <username>\r\n');
        break;
      }
      const targetUsername = args[0];
      if (typeof globalThis.getUserPlan === 'function') {
        const plan = await globalThis.getUserPlan(targetUsername);
        socket.write(plan + '\r\n');
      } else {
        socket.write('View plan unavailable.\r\n');
      }
      break;
    }
    case 'online': {
      if (!user.admin) {
        socket.write('\x1b[31mPermission denied.\x1b[97m\r\n');
        break;
      }
      if (typeof globalThis.listOnlineUsers === 'function') {
        const online = await globalThis.listOnlineUsers();
        let output = 'Online users:\r\n';
        for (const u of online) {
          output += `- ${u.username}\r\n`;
        }
        socket.write(output);
      } else {
        socket.write('Online user list unavailable.\r\n');
      }
      break;
    }
    default:
      socket.write(`\x1b[31mUnknown command: ${cmd}\x1b[97m\r\n`);
      break;
  }
}

globalThis.HandleCommands = HandleCommands;