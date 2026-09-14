// Copyright (c) 2026 Kruzio
// Licensed under the PolyForm Noncommercial License 1.0.0.
// Non-commercial use only. Commercial use and selling of this code are prohibited.
// https://polyformproject.org/licenses/noncommercial/1.0.0/

/**
 * Ark Admin Manager — UPnP Port Forwarding (IGD)
 * Automatyczne przekierowanie portów przez UPnP (SSDP discovery + SOAP AddPortMapping).
 */
const dgram = require('dgram');
const http = require('http');
const https = require('https');

const SSDP_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;

function discover(timeout = 3000) {
  return new Promise((resolve) => {
    const results = [];
    let done = false;
    const socket = dgram.createSocket('udp4');
    const msg = Buffer.from(
      'M-SEARCH * HTTP/1.1\r\n' +
      `HOST: ${SSDP_ADDR}:${SSDP_PORT}\r\n` +
      'MAN: "ssdp:discover"\r\n' +
      'MX: 2\r\n' +
      'ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n\r\n'
    );
    socket.on('message', (data) => {
      const txt = data.toString();
      const loc = txt.match(/LOCATION:\s*(.+)/i);
      if (loc) results.push(loc[1].trim());
    });
    socket.on('error', () => { if (!done) { done = true; try { socket.close(); } catch {} resolve([]); } });
    socket.bind(() => {
      try { socket.setBroadcast(true); socket.send(msg, 0, msg.length, SSDP_PORT, SSDP_ADDR); } catch (_) {}
    });
    setTimeout(() => { if (!done) { done = true; try { socket.close(); } catch {} resolve(results); } }, timeout);
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function parseControlUrls(descXml) {
  // Znajdź serviceType = WANIPConnection lub WANPPPConnection i jego controlURL
  const out = [];
  const serviceRegex = /<service>([\s\S]*?)<\/service>/g;
  let m;
  while ((m = serviceRegex.exec(descXml)) !== null) {
    const block = m[1];
    const type = (block.match(/<serviceType>([\s\S]*?)<\/serviceType>/) || [])[1];
    const control = (block.match(/<controlURL>([\s\S]*?)<\/controlURL>/) || [])[1];
    if (type && control && /WAN(IP|PPP)Connection/i.test(type)) {
      out.push({ type: type.trim(), controlURL: control.trim() });
    }
  }
  return out;
}

async function getGateway() {
  const locations = await discover();
  for (const location of locations) {
    try {
      const xml = await get(location);
      const services = parseControlUrls(xml);
      if (services.length) {
        const base = new URL(location);
        const control = new URL(services[0].controlURL, base.origin).href;
        return { serviceType: services[0].type, controlURL: control };
      }
    } catch (_) {}
  }
  return null;
}

function soapRequest(controlURL, serviceType, action, params) {
  return new Promise((resolve, reject) => {
    const url = new URL(controlURL);
    const body = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
<s:Body><u:${action} xmlns:u="${serviceType}">${params}</u:${action}></s:Body>
</s:Envelope>`;
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request({
      host: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname, method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        'SOAPAction': `"${serviceType}#${action}"`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('SOAP timeout')); });
    req.write(body);
    req.end();
  });
}

class UPnP {
  async addPort(port, protocol = 'TCP', description = 'ARK Server') {
    const gw = await getGateway();
    if (!gw) throw new Error('Nie znaleziono routera z UPnP (IGD)');
    const params =
      `<NewRemoteHost></NewRemoteHost>` +
      `<NewExternalPort>${port}</NewExternalPort>` +
      `<NewProtocol>${protocol}</NewProtocol>` +
      `<NewInternalPort>${port}</NewInternalPort>` +
      `<NewInternalClient></NewInternalClient>` +
      `<NewEnabled>1</NewEnabled>` +
      `<NewPortMappingDescription>${description}</NewPortMappingDescription>` +
      `<NewLeaseDuration>0</NewLeaseDuration>`;
    await soapRequest(gw.controlURL, gw.serviceType, 'AddPortMapping', params);
    return { success: true, port, protocol, description };
  }

  async removePort(port, protocol = 'TCP') {
    const gw = await getGateway();
    if (!gw) throw new Error('Nie znaleziono routera z UPnP (IGD)');
    const params = `<NewRemoteHost></NewRemoteHost><NewExternalPort>${port}</NewExternalPort><NewProtocol>${protocol}</NewProtocol>`;
    await soapRequest(gw.controlURL, gw.serviceType, 'DeletePortMapping', params);
    return { success: true, port, protocol };
  }

  async forwardServerPorts(server) {
    const ports = [
      { port: server.port, protocol: 'UDP', desc: `ARK ${server.name} Game` },
      { port: server.query_port, protocol: 'UDP', desc: `ARK ${server.name} Query` },
      { port: server.rcon_port, protocol: 'TCP', desc: `ARK ${server.name} RCON` },
    ];
    const results = [];
    for (const p of ports) {
      if (!p.port) continue;
      try { results.push(await this.addPort(p.port, p.protocol, p.desc)); }
      catch (e) { results.push({ success: false, ...p, error: e.message }); }
    }
    return results;
  }
}

module.exports = UPnP;
