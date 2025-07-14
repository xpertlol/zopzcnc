// Leaked by Dstat.ST & Elitestress.st :)
const fs = require('fs');
const path = require('path');

// Ensure __dirname is defined (for environments like node --input-type=module)
if (typeof __dirname === 'undefined') {
  global.__dirname = path.resolve();
}

const LOG_DIR = path.join(__dirname, './logs');
const LogPaths = {
  UserEdits: path.join(LOG_DIR, 'user_edits.log'),
  CreatedUsers: path.join(LOG_DIR, 'created_users.log'),
  RemovedUsers: path.join(LOG_DIR, 'removed_users.log'),
  LoginAttempts: path.join(LOG_DIR, 'login_attempts.log'),
  AdminDisconnects: path.join(LOG_DIR, 'admin_disconnects.log'),
  BroadcastMessage: path.join(LOG_DIR, 'broadcast_message.log'),
  AttacksSent: path.join(LOG_DIR, 'attack_sent.log'),
  CaptchaLogs: path.join(LOG_DIR, 'captcha.log'),
};

/**
 * Appends a log entry to the specified file, with ISO timestamp and optional extra data.
 * @param {string} filePath - Path to the log file.
 * @param {string} message - Log message.
 * @param {object} [extra={}] - Optional extra data to log as JSON.
 */
function logToFile(filePath, message, extra = {}) {
  const timestamp = new Date().toISOString();
  const extraStr = Object.keys(extra).length ? ' ' + JSON.stringify(extra) : '';
  fs.appendFileSync(filePath, `[${timestamp}] ${message}${extraStr}\n`, 'utf8');
}

/**
 * Truncates all log files in LogPaths (clears their contents).
 */
function clearLogs() {
  for (const logFile of Object.values(LogPaths)) {
    fs.truncateSync(logFile);
  }
}

globalThis.logToFile = logToFile;
globalThis.clearLogs = clearLogs;
globalThis.LogPaths = LogPaths;