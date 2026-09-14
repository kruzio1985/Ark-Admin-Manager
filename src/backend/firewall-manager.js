// Copyright (c) 2026 Kruzio
// Licensed under the PolyForm Noncommercial License 1.0.0.
// Non-commercial use only. Commercial use and selling of this code are prohibited.
// https://polyformproject.org/licenses/noncommercial/1.0.0/

/**
 * Ark Admin Manager — Firewall Manager
 * Zarządza Windows Firewall: dodawanie/usuwanie reguł dla portów serwerów ARK
 * Działa na Windows PL i EN (PowerShell + netsh fallback)
 */

class FirewallManager {
  constructor(db) {
    this.db = db;
  }

  async getConfig() {
    return this.db.queryOne('SELECT * FROM firewall_config WHERE id = 1');
  }

  async saveConfig(config) {
    const fields = ['manage_automatically'];
    const sets = [];
    const values = [];
    for (const f of fields) {
      if (config[f] !== undefined) { sets.push(`${f} = ?`); values.push(config[f]); }
    }
    if (sets.length > 0) {
      sets.push("updated_at = datetime('now','localtime')");
      this.db.run(`UPDATE firewall_config SET ${sets.join(', ')} WHERE id = 1`, values);
      this.db.save();
    }
    return this.getConfig();
  }

  /**
   * Add firewall rules for a server's ports
   */
  async addServerRules(serverName, ports) {
    const { execSync } = require('child_process');
    const cfg = await this.getConfig();
    if (!cfg?.manage_automatically) return { added: false, reason: 'Auto-firewall disabled' };

    const addedRules = [];
    const ruleNames = [
      { port: ports.game, name: `ARK Game (${serverName})`, protocol: 'UDP' },
      { port: ports.query, name: `ARK Query (${serverName})`, protocol: 'UDP' },
      { port: ports.rcon, name: `ARK RCON (${serverName})`, protocol: 'TCP' },
    ];

    for (const rule of ruleNames) {
      if (!rule.port) continue;
      try {
        this._addFirewallRule(rule.name, rule.port, rule.protocol);
        addedRules.push(rule.name);
        console.log(`[Firewall] Added rule: ${rule.name} (${rule.port}/${rule.protocol})`);
      } catch (e) {
        console.error(`[Firewall] Failed to add rule ${rule.name}:`, e.message);
      }
    }

    // Save added rules to DB
    const existing = JSON.parse((await this.getConfig())?.added_rules || '[]');
    const updated = [...new Set([...existing, ...addedRules])];
    this.db.run("UPDATE firewall_config SET added_rules = ? WHERE id = 1", [JSON.stringify(updated)]);
    this.db.save();

    return { added: addedRules.length > 0, rules: addedRules };
  }

  /**
   * Remove firewall rules for a server
   */
  async removeServerRules(serverName) {
    const { execSync } = require('child_process');
    const cfg = await this.getConfig();
    const addedRules = JSON.parse(cfg?.added_rules || '[]');
    const serverRules = addedRules.filter(r => r.includes(serverName));

    for (const ruleName of serverRules) {
      try {
        this._removeFirewallRule(ruleName);
        console.log(`[Firewall] Removed rule: ${ruleName}`);
      } catch (e) {
        console.error(`[Firewall] Failed to remove rule ${ruleName}:`, e.message);
      }
    }

    const remaining = addedRules.filter(r => !r.includes(serverName));
    this.db.run("UPDATE firewall_config SET added_rules = ? WHERE id = 1", [JSON.stringify(remaining)]);
    this.db.save();

    return { removed: serverRules.length, rules: serverRules };
  }

  /**
   * Check if firewall rules exist for ports
   */
  checkPortOpen(port, protocol = 'UDP') {
    try {
      const result = execSync(
        `netsh advfirewall firewall show rule name=all | findstr /C:"${port}"`,
        { encoding: 'utf8', timeout: 5000 }
      );
      return result.includes(String(port));
    } catch {
      return false;
    }
  }

  /**
   * Get all ARK-related firewall rules
   */
  listArkRules() {
    try {
      // Use PowerShell for more reliable output parsing (works on all Windows languages)
      const { execSync } = require('child_process');
      const psCmd = `powershell -Command "Get-NetFirewallRule | Where-Object { $_.DisplayName -like '*ARK*' } | Select-Object DisplayName, Enabled, @{N='Port';E={(Get-NetFirewallPortFilter -AssociatedNetFirewallRule $_).LocalPort}}, @{N='Protocol';E={(Get-NetFirewallPortFilter -AssociatedNetFirewallRule $_).Protocol}} | ConvertTo-Json"`;
      const result = execSync(psCmd, { encoding: 'utf8', timeout: 10000, windowsHide: true });
      
      try {
        const parsed = JSON.parse(result);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        return items.filter(r => r && r.DisplayName).map(r => ({
          name: r.DisplayName,
          port: r.Port || 'Any',
          protocol: r.Protocol || 'Any',
          enabled: r.Enabled === true || r.Enabled === 'True',
        }));
      } catch {
        // Fallback to netsh
        return this._listRulesNetsh();
      }
    } catch {
      return this._listRulesNetsh();
    }
  }

  _listRulesNetsh() {
    try {
      const { execSync } = require('child_process');
      const result = execSync(
        'netsh advfirewall firewall show rule name=all verbose',
        { encoding: 'utf8', timeout: 10000, windowsHide: true }
      );
      const lines = result.split('\n');
      const rules = [];
      let currentRule = null;

      for (const line of lines) {
        const trimmed = line.trim();
        // Match both English and Polish (and other languages) by looking for key patterns
        if (/Rule Name|Nazwa reguły/i.test(trimmed) && /ARK/i.test(trimmed)) {
          if (currentRule?.name) rules.push({ ...currentRule });
          currentRule = { name: trimmed.split(':').slice(1).join(':').trim() };
        } else if (currentRule && /LocalPort|Port lokalny/i.test(trimmed)) {
          currentRule.port = trimmed.split(':').slice(1).join(':').trim();
        } else if (currentRule && /Protocol|Protokół/i.test(trimmed)) {
          currentRule.protocol = trimmed.split(':').slice(1).join(':').trim();
        } else if (currentRule && /Enabled|Włączona/i.test(trimmed)) {
          currentRule.enabled = /Yes|Tak/i.test(trimmed);
        }
      }
      if (currentRule?.name) rules.push(currentRule);
      return rules;
    } catch {
      return [];
    }
  }

  /**
   * Check if server is publicly accessible
   */
  async getPublicIP() {
    try {
      const https = require('https');
      return new Promise((resolve) => {
        https.get('https://api.ipify.org', { timeout: 5000 }, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => resolve(data.trim()));
        }).on('error', () => resolve('Unable to detect'));
      });
    } catch { return 'Unable to detect'; }
  }

  async addServerRulesBulk(servers) {
    const cfg = await this.getConfig();
    if (!cfg?.manage_automatically) return { added: 0, reason: 'Auto-firewall disabled' };
    const { execSync } = require('child_process');
    let added = 0;
    for (const s of servers) {
      for (const { port, proto, label } of [
        { port: s.port || 7790, proto: 'UDP', label: `ARK Game (${s.name})` },
        { port: s.query_port || 27017, proto: 'UDP', label: `ARK Query (${s.name})` },
        { port: s.rcon_port || 32330, proto: 'TCP', label: `ARK RCON (${s.name})` },
      ]) {
        if (!port) continue;
        try {
          execSync(`netsh advfirewall firewall add rule name="${label}" dir=in action=allow protocol=${proto} localport=${port}`, { encoding:'utf8', timeout:5000, windowsHide:true });
          added++;
        } catch(_) {}
      }
    }
    return { added, message: `Added ${added} firewall rules` };
  }

  async checkPortOpen(port, host = '127.0.0.1') {
    try {
      const net = require('net');
      return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(5000);
        socket.on('connect', () => { socket.destroy(); resolve(true); });
        socket.on('error', () => resolve(false));
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
        socket.connect(port, host);
      });
    } catch {
      return false;
    }
  }

  // ── Internal ──
  _addFirewallRule(name, port, protocol = 'UDP') {
    const { execSync } = require('child_process');
    const cmd = `netsh advfirewall firewall add rule name="${name}" dir=in action=allow protocol=${protocol} localport=${port}`;
    execSync(cmd, { encoding: 'utf8', timeout: 10000, windowsHide: true });
  }

  _removeFirewallRule(name) {
    const { execSync } = require('child_process');
    const cmd = `netsh advfirewall firewall delete rule name="${name}"`;
    execSync(cmd, { encoding: 'utf8', timeout: 10000, windowsHide: true });
  }
}

module.exports = FirewallManager;
