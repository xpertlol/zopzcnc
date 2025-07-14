// Leaked by Dstat.ST & Elitestress.st :)
const dns = require('dns').promises;
const net = require('net');
// Resolves a hostname to an IP address
async function resolveIP(hostname) {
  return await dns.lookup(hostname);
}
// Gets ASN, org, and country code for a target (hostname or IP)
async function getTargetDetails(target) {
  let host = target;
  if (host.startsWith('http://') || host.startsWith('https://')) {
    host = new URL(host).hostname;
  }
  const ip = net.isIP(host) ? host : (await resolveIP(host))?.address;
  if (!ip) {
    return {
      asn: 'Unknown',
      org: 'Unknown',
      country_code: 'Unknown'
    };
  }
  const response = await fetch('https://zopzsniff.xyz/geoip/' + ip);
  const data = await response.json();
  if (response.ok) {
    return {
      asn: data.asn?.asn ? 'AS' + data.asn.asn : 'Unknown',
      org: data.asn?.org || 'Unknown',
      country_code: data.location?.country_code || 'Unknown'
    };
  }
  return {
    asn: 'Unknown',
    org: 'Unknown',
    country_code: 'Unknown'
  };
}

globalThis.getTargetDetails = getTargetDetails;