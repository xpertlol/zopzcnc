// Leaked by Dstat.ST & Elitestress.st :)
const path = require('path');
const fs = require('fs');

// Ensure __dirname is defined (for environments like node --input-type=module)
if (typeof __dirname === 'undefined') {
  global.__dirname = path.resolve();
}

// Load console utilities (assumes consoleUtils.js exposes clearScreen, etc. on globalThis)
eval(fs.readFileSync(path.join(__dirname, './utils/consoleUtils.js'), 'utf8'));

/**
 * Checks if a user is expired based on their expiry date in the database.
 * @param {object} context - The context containing mongo_db_collection.
 * @param {object} db - The database object with findDocumentByKey.
 * @param {object} user - The user object (must have username).
 * @returns {Promise<boolean>} True if expired, false otherwise.
 */
async function isUserExpired(context, db, user) {
  const doc = await db.findDocumentByKey('username', user.username, context.mongo_db_collection);
  if (!doc || !doc.expiry) return true;
  if (doc.expiry === 'Lifetime') return false;
  const [month, day, year] = doc.expiry.split('/').map(Number);
  const expiryDate = new Date(year, month - 1, day);
  const now = new Date();
  return now > expiryDate;
}

/**
 * Returns the number of days until expiry, or a large number for 'Lifetime'.
 * @param {string} expiry - Expiry string in MM/DD/YYYY or 'Lifetime'.
 * @returns {number}
 */
function getExpiryDays(expiry) {
  if (expiry === 'Lifetime') return 99999;
  const parts = expiry.split('/').map(s => s.trim());
  if (parts.length !== 3) return NaN;
  let [month, day, year] = parts.map(Number);
  const expiryDate = new Date(Date.UTC(year, month - 1, day));
  if (isNaN(expiryDate.getTime())) return NaN;
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const diff = expiryDate.getTime() - now.getTime();
  const days = diff / 86400000;
  return parseFloat(days.toFixed(2));
}

/**
 * Returns a future expiry date string in MM/DD/YYYY format, or 'Lifetime'.
 * @param {string|number} days - Number of days or 'lifetime'.
 * @returns {string}
 */
function getTime(days) {
  if (typeof days === 'string' && days.toLowerCase() === 'lifetime') return 'Lifetime';
  const d = new Date();
  d.setDate(d.getDate() + parseInt(days));
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/**
 * Disconnects all sessions for a given username from a Map of sessions.
 * @param {Map} sessions - Map of sessionId => sessionObj (must have user and client).
 * @param {string} username - Username to disconnect.
 * @returns {boolean} True if any sessions were disconnected.
 */
function disconnectUserByUsername(sessions, username) {
  const matches = [...sessions.entries()].filter(([_id, sess]) => sess.user.username.toLowerCase() === username.toLowerCase());
  for (const [sessionId, session] of matches) {
    try {
      session.client.end();
    } catch (err) {
      console.error(`[!] Error disconnecting ${username}:`, err.message);
    }
    if (session?.intervals) {
      for (const interval of session.intervals) {
        clearInterval(interval);
      }
    }
    sessions.delete(sessionId);
    console.log(`Disconnected user: ${username} (Session: ${sessionId})`);
  }
  return matches.length > 0;
}

/**
 * Broadcasts a message to all users except the sender.
 * @param {string} sender - Username of the sender.
 * @param {Map} sessions - Map of sessionId => sessionObj (must have user and stream).
 * @param {string} message - Message to broadcast.
 * @returns {number} Number of users messaged.
 */
function broadcastMessage(sender, sessions, message) {
  let count = 0;
  for (const [sessionId, session] of sessions.entries()) {
    const user = session?.user;
    const stream = session?.stream;
    if (!user || !stream) continue;
    if (user.username.toLowerCase() === sender.toLowerCase()) continue;
    try {
      globalThis.clearScreen(stream);
      stream.write(`\r${message}\n`);
      stream.write(`\nPress \x1b[32mEnter help\x1b[0m to return to the default menu...\n`);
      count++;
    } catch (err) {
      console.error(`[!] Error broadcasting to session ${sessionId}:`, err.message);
    }
  }
  console.log(`Broadcasted message to ${count} user(s): "${message}"`);
  return count;
}

globalThis.isUserExpired = isUserExpired;
globalThis.getExpiryDays = getExpiryDays;
globalThis.disconnectUserByUsername = disconnectUserByUsername;
globalThis.broadcastMessage = broadcastMessage;
globalThis.getTime = getTime;