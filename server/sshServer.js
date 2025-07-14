// Leaked by Dstat.ST & Elitestress.st :)
const path = require('path');
const fs = require('fs');
const { Server } = require('ssh2');
if (typeof __dirname === 'undefined') global.__dirname = path.resolve();

// Load utility scripts
// (Assumes LogUtils.js, CommandHandler.js, UserUtils.js, PageUtils.js define global helpers)
eval(fs.readFileSync(path.join(__dirname, './utils/LogUtils.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './handlers/CommandHandler.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/UserUtils.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/PageUtils.js'), 'utf8'));

const HostKey = fs.readFileSync(path.join(__dirname, './keys/host.key'));

async function startSSHServer(config, mongo, attackHandler) {
  // Map of sessionID -> { user, client, stream, intervals }
  const activeSessions = new Map();
  const sshServer = new Server({
    hostKeys: [HostKey],
    keepaliveInterval: 30000,
    banner: config?.banner_message || 'Welcome'
  }, async client => {
    let userDoc = null;
    let duplicateSessionId = null;
    let pauseRef = { value: false };
    const remoteAddr = client._sock.remoteAddress;
    const ip = remoteAddr.startsWith('::ffff:') ? remoteAddr.slice(7) : remoteAddr;
    const sessionId = Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    function cleanup() {
      const session = activeSessions.get(sessionId);
      if (session?.intervals) for (const intv of session.intervals) clearInterval(intv);
      activeSessions.delete(sessionId);
    }
    client.on('authentication', async ctx => {
      if (ctx.method !== 'password') return ctx.reject(['password']);
      const username = ctx.username;
      const user = await mongo.findDocumentByKey('username', username.toLowerCase(), config.mongo_db_collection);
      if (user && user.password === ctx.password) {
        if (await globalThis.isUserExpired(config, mongo, user)) {
          globalThis.logToFile(globalThis.LogPaths.LoginAttempts, `FAILED - ${username} - Account expired`);
          return ctx.reject(['password'], false, { message: 'Your account has expired. Contact support.' });
        }
        if (user.banned) {
          globalThis.logToFile(globalThis.LogPaths.LoginAttempts, `FAILED - ${username} - Account banned`);
          return ctx.reject(['password'], false, { message: '\x1b[31mYour account has been banned. Access denied.\x1b[0m' });
        }
        duplicateSessionId = [...activeSessions.entries()].find(([_, s]) => s.user.username === username)?.[0];
        globalThis.logToFile(globalThis.LogPaths.LoginAttempts, `SUCCESS - ${username} - IP: ${ip} - SessionID: ${sessionId}`);
        userDoc = user;
        userDoc.username = userDoc.username.toLowerCase();
        activeSessions.set(sessionId, { user, client, stream: null, intervals: [] });
        ctx.accept();
      } else {
        globalThis.logToFile(globalThis.LogPaths.LoginAttempts, `FAILED - ${username} - Invalid credentials`);
        ctx.reject();
      }
    });
    client.on('ready', async () => {
      client.on('session', async accept => {
        const session = accept();
        session.on('pty', acceptPty => {
          acceptPty({ term: 'xterm-256color', rows: 24, cols: 80 });
        });
        session.on('shell', acceptShell => {
          const stream = acceptShell();
          // CAPTCHA if enabled
          if (config.ssh.captcha_enabled) {
            let captchaPassed = false;
            let attempts = 0;
            const maxAttempts = 3;
            const a = Math.floor(Math.random() * 10) + 1;
            const b = Math.floor(Math.random() * 10) + 1;
            const answer = (a + b).toString();
            stream.write('\x1b[2J\x1b[H');
            stream.write('\x1b[33m[!] Verification Required\x1b[0m\r\n');
            stream.write(`\x1b[36mSolve this to continue: What is ${a} + ${b}?\x1b[0m\r\n`);
            stream.write('\x1b[97mAnswer: \x1b[0m');
            let input = '';
            const onData = chunk => {
              const str = chunk.toString('utf-8');
              if (str.startsWith('\x1b')) return;
              if (str === '\r' || str === '\n') {
                stream.write('\r\n');
                if (input.trim() === answer) {
                  globalThis.logToFile(globalThis.LogPaths.CaptchaLogs, `CAPTCHA PASS - ${userDoc?.username || 'Unknown'} - IP: ${ip} - SessionID: ${sessionId}`);
                  captchaPassed = true;
                  stream.removeListener('data', onData);
                  stream.write('\x1b[32mCorrect! Access granted.\x1b[0m\r\n');
                  setTimeout(() => {
                    stream.write('\x1b[2J\x1b[H');
                    startShell();
                  }, 500);
                } else {
                  attempts++;
                  if (attempts >= maxAttempts) {
                    globalThis.logToFile(globalThis.LogPaths.CaptchaLogs, `CAPTCHA FAIL - ${userDoc?.username || 'Unknown'} - IP: ${ip} - SessionID: ${sessionId}`);
                    stream.write('\x1b[31m[-] Too many incorrect answers. Connection closed.\x1b[0m\r\n');
                    stream.end();
                    client.end();
                  } else {
                    input = '';
                    stream.write(`\x1b[31m[!] Incorrect. Try again (${maxAttempts - attempts} tries left)\x1b[0m\r\n`);
                    stream.write('\x1b[97mAnswer: \x1b[0m');
                  }
                }
                return;
              }
              if (str === '\x7f' || str === '\b') {
                if (input.length > 0) {
                  input = input.slice(0, -1);
                  stream.write('\b \b');
                }
              } else {
                input += str;
                stream.write(str);
              }
            };
            stream.on('data', onData);
          } else {
            startShell();
          }
          function startShell() {
            let pages = globalThis.loadPages(config);
            activeSessions.get(sessionId).stream = stream;
            stream.write('\x1b[2J\x1b[H');
            let currentInput = '';
            let cursor = 0;
            let historyIndex = -1;
            let history = [];
            let prompt = globalThis.replaceCNCname(globalThis.replaceUsername(pages.prompt.trimEnd(), userDoc), config.cnc_name);
            let promptLines = prompt.split(/\r?\n/);
            let promptLast = promptLines[promptLines.length - 1];
            let promptLen = globalThis.stripAnsi(promptLast).length;
            // Title and user refresh intervals
            const titleInterval = setInterval(() => {
              const userMap = new Map();
              for (const s of activeSessions.values()) {
                if (s?.user?.username) userMap.set(s.user.username, s);
              }
              try {
                stream.write(`\x1b]0;${globalThis.replaceTitle(pages.title, config, userMap, attackHandler, userDoc)}\x07`);
              } catch (e) {
                console.error('[Interval Error] Failed to write title: ' + e.message);
              }
            }, 1000);
            const userRefreshInterval = setInterval(async () => {
              pages = globalThis.loadPages(config);
              userDoc = await mongo.findDocumentByKey('username', userDoc.username.toLowerCase(), config.mongo_db_collection);
              userDoc.username = userDoc.username.toLowerCase();
              prompt = globalThis.replaceCNCname(globalThis.replaceUsername(pages.prompt.trimEnd(), userDoc), config.cnc_name);
              promptLines = prompt.split(/\r?\n/);
              promptLast = promptLines[promptLines.length - 1];
              promptLen = globalThis.stripAnsi(promptLast).length;
              const session = activeSessions.get(sessionId);
              if (session) session.user = userDoc;
              else {
                console.warn('Session with ID ' + sessionId + ' not found in activeSessions.');
                clearInterval(userRefreshInterval);
              }
            }, 5000);
            activeSessions.get(sessionId).intervals.push(titleInterval, userRefreshInterval);
            // Duplicate session prompt
            if (duplicateSessionId) {
              currentInput = '';
              cursor = 0;
              stream.write('\x1b[2J\x1b[H');
              stream.write('\x1b[31m[!] You are already logged in elsewhere.\x1b[0m\r\n');
              stream.write("\x1b[97mDo you want to close your previous session and continue here? (yes/no)\x1b[0m\r\n");
              if (promptLines.length > 1) for (let i = 0; i < promptLines.length - 1; ++i) stream.write(promptLines[i] + '\n');
              stream.write('\r' + promptLast);
            } else if (pages.home) {
              stream.write('\x1b[2J\x1b[H');
              stream.write(globalThis.replaceUsername(pages.home, userDoc));
              if (promptLines.length > 1) for (let i = 0; i < promptLines.length - 1; ++i) stream.write(promptLines[i] + '\n');
              stream.write('\r' + promptLast);
            }
            // Main shell input handler
            stream.on('data', async chunk => {
              if (pauseRef.value === true) return;
              const str = chunk.toString('utf-8');
              if (str.startsWith('\x1b')) {
                if (str === '\x1b[A' && history.length > 0 && historyIndex < history.length - 1) {
                  historyIndex++;
                  currentInput = history[history.length - 1 - historyIndex];
                  cursor = currentInput.length;
                  globalThis.redrawInline(stream, currentInput, cursor, promptLen, { value: 0 });
                } else if (str === '\x1b[B') {
                  if (historyIndex > 0) {
                    historyIndex--;
                    currentInput = history[history.length - 1 - historyIndex];
                  } else {
                    historyIndex = -1;
                    currentInput = '';
                  }
                  cursor = currentInput.length;
                  globalThis.redrawInline(stream, currentInput, cursor, promptLen, { value: 0 });
                } else if (str === '\x1b[D' && cursor > 0) {
                  cursor--;
                  stream.write('\x1b[D');
                } else if (str === '\x1b[C' && cursor < currentInput.length) {
                  cursor++;
                  stream.write('\x1b[C');
                }
                return;
              }
              if (str === '\r' || str === '\n') {
                stream.write('\r\n');
                const input = currentInput.trim();
                if (input) history.push(input);
                historyIndex = -1;
                if (duplicateSessionId) {
                  if (["yes", "y"].includes(input.toLowerCase())) {
                    const oldClient = activeSessions.get(duplicateSessionId)?.client;
                    if (oldClient) oldClient.end();
                    activeSessions.delete(duplicateSessionId);
                    duplicateSessionId = null;
                    stream.write('\x1b[32mOld session closed. Redirecting...\x1b[0m\r\n');
                    setTimeout(() => {
                      stream.write('\x1b[2J\x1b[H');
                      stream.write(globalThis.replaceUsername(pages.home, userDoc));
                      stream.write('\r' + promptLast);
                    }, 1000);
                  } else {
                    stream.write('\x1b[31m[-] Session aborted.\x1b[0m\r\n');
                    stream.end();
                    client.end();
                  }
                } else {
                  // Command dispatch
                  const [command, ...params] = input.split(' ');
                  const sessionObj = {
                    command,
                    params,
                    client,
                    stream,
                    pageContents: pages,
                    user: userDoc,
                    attackHandler,
                    db: mongo,
                    config,
                    activeSessions,
                    pauseRef
                  };
                  await globalThis.HandleCommands(sessionObj);
                }
                currentInput = '';
                cursor = 0;
                if (promptLines.length > 1) for (let i = 0; i < promptLines.length - 1; ++i) stream.write(promptLines[i] + '\n');
                stream.write('\r' + promptLast);
                return;
              }
              if (str === '\x7f' || str === '\b') {
                if (cursor > 0) {
                  currentInput = currentInput.slice(0, cursor - 1) + currentInput.slice(cursor);
                  cursor--;
                  globalThis.redrawInline(stream, currentInput, cursor, promptLen, { value: 0 });
                }
                return;
              }
              currentInput = currentInput.slice(0, cursor) + str + currentInput.slice(cursor);
              cursor += str.length;
              globalThis.redrawInline(stream, currentInput, cursor, promptLen, { value: 0 });
            });
          }
          stream.on('end', cleanup);
        });
      });
    });
    client.on('end', cleanup);
    client.on('close', cleanup);
    client.on('disconnect', cleanup);
    client.on('error', err => {
      if (err.code !== 'ECONNRESET') console.error(`[SSH ERROR] Client IP: ${ip}, SessionID: ${sessionId}, Error: ${err.code} - ${err.message}`);
      cleanup();
    });
  });
  sshServer.listen(config.ssh.port, '0.0.0.0', () => {
    console.log('SSH server listening on port ' + config.ssh.port);
  });
}

globalThis.startSSHServer = startSSHServer;