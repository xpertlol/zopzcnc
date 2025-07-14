// Leaked by Dstat.ST & Elitestress.st :)
function replaceUsername(str, user) {
  const username = user?.username || 'unknown';
  return str.replace(/{username.user}/g, username);
}

function replaceCNCname(str, cncName) {
  return str.replace(/{cnc.name}/g, cncName);
}

function sanitizeAdminLines(str, user) {
  if (!user || typeof user.admin === 'undefined') return str;
  return user.admin ? str : str.split('\n').filter(line => !line.toLowerCase().includes('admin')).join('\n');
}

function sanitizeResellerLines(str, user) {
  if (!user || typeof user.reseller === 'undefined') return str;
  return user.reseller ? str : str.split('\n').filter(line => !line.toLowerCase().includes('reseller')).join('\n');
}

function stripAnsi(str) {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

function clearScreen(stream) {
  stream.write('\x1b[2J\x1b[H');
}

function resizeTerminal(stream) {
  stream.write('\x1b[8;24;80t');
}

function replaceTitle(title, config, onlineMap, attackHandler, user) {
  const spinner1 = ['|', '/', '-', '\\'];
  const spinner2 = ['<   3', '<-  3', '< - 3', '<  -3'];
  const spinnerArr = config.spinnertype === 'succubus' ? spinner2 : spinner1;
  if (typeof config.spinnerIndex === 'undefined') config.spinnerIndex = 0;
  const spinner = spinnerArr[config.spinnerIndex];
  config.spinnerIndex = (config.spinnerIndex + 1) % spinnerArr.length;
  return title
    .replace(/{cnc_name}/g, config.cnc_name)
    .replace(/{online}/g, onlineMap.size)
    .replace(/{used_slots}/g, attackHandler.activeAttacks.size)
    .replace(/{max_slots}/g, config.max_concurrents)
    .replace(/{expiry}/g, user.expiry)
    .replace(/{spinner}/g, spinner);
}

function replaceplan(str, user) {
  return str
    .replace(/{user.username}/g, user.username)
    .replace(/{user.password}/g, user.password)
    .replace(/{user.role}/g, user.role)
    .replace(/{user.admin}/g, user.admin)
    .replace(/{user.reseller}/g, user.reseller)
    .replace(/{user.vip}/g, user.vip)
    .replace(/{user.expiry}/g, user.expiry)
    .replace(/{user.maxTime}/g, user.maxTime)
    .replace(/{user.concurrents}/g, user.concurrents)
    .replace(/{user.cooldown}/g, user.cooldown)
    .replace(/{user.api}/g, user.api)
    .replace(/{user.spambypass}/g, user.spambypass)
    .replace(/{user.blacklistbypass}/g, user.blacklistbypass)
    .replace(/{user.homeholder}/g, user.homeholder)
    .replace(/{user.botnet}/g, user.botnet)
    .replace(/{user.banned}/g, user.banned);
}

function replaceResellerstats(str, reseller) {
  return str
    .replace(/{username}/g, reseller.username)
    .replace(/{reseller.usersSold}/g, reseller.usersSold)
    .replace(/{reseller.earnings}/g, reseller.earnings)
    .replace(/{reseller.owed}/g, reseller.owed);
}

function redrawInline(stream, input, cursor, promptLen, ref) {
  const cleanInput = input.replace(/\r|\n/g, '');
  const diff = ref.value - cleanInput.length;
  let out = '';
  out += `\r\x1b[${promptLen + 1}G`;
  out += cleanInput;
  if (diff > 0) {
    out += ' '.repeat(diff);
    out += `\x1b[${diff}D`;
  }
  out += `\x1b[${promptLen + cursor + 1}G`;
  stream.write(out);
  ref.value = cleanInput.length;
}

globalThis.replaceplan = replaceplan;
globalThis.redrawInline = redrawInline;
globalThis.replaceTitle = replaceTitle;
globalThis.replaceCNCname = replaceCNCname;
globalThis.replaceUsername = replaceUsername;
globalThis.stripAnsi = stripAnsi;
globalThis.sanitizeAdminLines = sanitizeAdminLines;
globalThis.sanitizeResellerLines = sanitizeResellerLines;
globalThis.clearScreen = clearScreen;
globalThis.resizeTerminal = resizeTerminal;