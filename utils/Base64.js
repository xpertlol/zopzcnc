// Leaked by Dstat.ST & Elitestress.st :)
function base64ToString(str) {
  return Buffer.from(str, 'base64').toString('utf8');
}

globalThis.base64ToString = base64ToString;