// Leaked by Dstat.ST & Elitestress.st :)
// Converts a base64-encoded string to a UTF-8 string
function base64ToString(str) {
  return Buffer.from(str, 'base64').toString('utf8');
}

globalThis.base64ToString = base64ToString;