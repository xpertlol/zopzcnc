// Leaked by Dstat.ST & Elitestress.st :)

/**
 * Safely parses a JSON string. Returns the parsed object, or null if parsing fails.
 * @param {string} str - The JSON string to parse.
 * @returns {any|null}
 */
function parse(str) {
  try {
    return JSON.parse(str);
  } catch (err) {
    return null;
  }
}

globalThis.parse = parse;