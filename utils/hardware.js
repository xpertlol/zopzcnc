// Leaked by Dstat.ST & Elitestress.st :)
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

/**
 * Generates a hardware ID (HWID) by reading the system's product UUID and hashing it.
 * Returns a SHA-256 hex string, or null if generation fails.
 */
function getHardwareId() {
  try {
    let productUUID = '';
    try {
      // Attempt to read the product UUID from Linux systems
      productUUID = execSync('cat /sys/class/dmi/id/product_uuid', {
        encoding: 'utf8'
      }).trim();
    } catch {
      // Could add platform-specific fallbacks here if needed
    }
    return crypto.createHash('sha256').update(productUUID).digest('hex');
  } catch (err) {
    console.error('HWID generation failed:', err);
    return null;
  }
}

globalThis.getHardwareId = getHardwareId;