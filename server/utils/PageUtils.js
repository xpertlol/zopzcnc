// Leaked by Dstat.ST & Elitestress.st :)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Ensure __dirname is defined (for environments like node --input-type=module)
if (typeof __dirname === 'undefined') {
  global.__dirname = path.resolve();
}

let lastHashes = {};
let currentPages = {};
let initialized = false;

function getHash(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Loads all .tfx pages from the ./pages directory, watches for changes, and caches their contents.
 * Returns an object mapping page names to their contents.
 * @returns {Object<string, string>}
 */
function loadPages() {
  const pagesDir = path.join(__dirname, './pages');
  if (!fs.existsSync(pagesDir)) {
    throw new Error('[-] Pages directory does not exist: ' + pagesDir);
  }

  const reloadPages = () => {
    const files = fs.readdirSync(pagesDir);
    const newPages = {};
    const newHashes = {};
    let changed = false;
    for (const file of files) {
      if (!file.endsWith('.tfx')) continue;
      const pageName = path.basename(file, '.tfx');
      const filePath = path.join(pagesDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const hash = getHash(content);
        newHashes[pageName] = hash;
        if (lastHashes[pageName] !== hash) changed = true;
        newPages[pageName] = content;
      } catch (err) {
        console.error('[-] Failed to load page ' + filePath + ':', err.message);
      }
    }
    if (changed || Object.keys(newPages).length !== Object.keys(currentPages).length) {
      lastHashes = newHashes;
      currentPages = newPages;
      console.log('Pages reloaded.');
    }
  };

  if (!initialized) {
    initialized = true;
    fs.watch(pagesDir, { persistent: false }, (event, filename) => {
      if (filename && filename.endsWith('.tfx')) {
        clearTimeout(loadPages._timeout);
        loadPages._timeout = setTimeout(reloadPages, 250);
      }
    });
  }
  reloadPages();
  return currentPages;
}

globalThis.loadPages = loadPages;