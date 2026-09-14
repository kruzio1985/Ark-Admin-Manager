// Copyright (c) 2026 Kruzio
// Licensed under the PolyForm Noncommercial License 1.0.0.
// Non-commercial use only. Commercial use and selling of this code are prohibited.
// https://polyformproject.org/licenses/noncommercial/1.0.0/

/**
 * Ark Admin Manager — Mod Manager
 * Obsługa modów: Steam Workshop (ASE) + CurseForge (ASA)
 */
const path = require('path');
const fs = require('fs');
const https = require('https');

class ModManager {
  constructor(db, steamcmd, serversDir) {
    this.db = db;
    this.steamcmd = steamcmd;
    this.serversDir = serversDir;
  }

  // ═══════════════════════════════════════════════════════════════════
  // MOD CRUD
  // ═══════════════════════════════════════════════════════════════════

  async listMods(serverId) {
    // Kolejność instalacji = kolejność ładowania (load order)
    if (serverId === undefined || serverId === null || serverId === '') return [];
    return this.db.query(
      'SELECT * FROM server_mods WHERE server_id = ? ORDER BY id',
      [serverId]
    );
  }

  async getActiveModIds(serverId) {
    const mods = this.db.query(
      'SELECT mod_id FROM server_mods WHERE server_id = ? AND active = 1',
      [serverId]
    );
    return mods.map(m => m.mod_id);
  }

  /**
   * Dopisuje ActiveMods=<id1,id2,...> do GameUserSettings.ini [ServerSettings]
   * (bez nadpisywania reszty pliku). Dzięki temu mod faktycznie ładuje się po
   * restarcie serwera. Stary wpis ActiveMods jest zastępowany.
   */
  _writeActiveMods(server) {
    try {
      const configDir = path.join(server.install_path, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
      const gusPath = path.join(configDir, 'GameUserSettings.ini');
      const active = this.getActiveModIds(server.id);
      if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
      const modsLine = `ActiveMods=${active.join(',')}`;
      let lines = [];
      if (fs.existsSync(gusPath)) {
        lines = fs.readFileSync(gusPath, 'utf8').split(/\r?\n/);
      }
      // Usuń istniejące linie ActiveMods (w całym pliku)
      lines = lines.filter(l => !/^\s*ActiveMods\s*=/.test(l));
      // Wstaw w sekcji [ServerSettings]; jeśli jej nie ma — dopisz na końcu
      const ssIdx = lines.findIndex(l => /^\s*\[ServerSettings\]\s*$/i.test(l));
      if (active.length && ssIdx >= 0) {
        lines.splice(ssIdx + 1, 0, modsLine);
      } else if (active.length) {
        lines.push('', '[ServerSettings]', modsLine);
      }
      fs.writeFileSync(gusPath, lines.join('\r\n'));
      console.log(`[ModManager] ActiveMods → ${gusPath}: ${active.length ? modsLine : '(none)'}`);
    } catch (e) {
      console.error('[ModManager] Failed to write ActiveMods:', e.message);
    }
  }

  async searchMods(query, gameType) {
    if (gameType === 'ASA') {
      return this._searchCurseForge(query);
    } else {
      return this._searchSteamWorkshop(query);
    }
  }

  async getModDetails(modId, gameType) {
    if (gameType === 'ASA') {
      return this._getCurseForgeModDetails(modId);
    } else {
      return this._getSteamWorkshopDetails(modId);
    }
  }

  async installMod(serverId, modId) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) throw new Error(`Server ${serverId} not found`);

    // Check if already installed
    const existing = this.db.queryOne(
      'SELECT * FROM server_mods WHERE server_id = ? AND mod_id = ?',
      [serverId, modId]
    );

    if (existing?.installed) {
      // Reactivate
      this.db.run('UPDATE server_mods SET active = 1 WHERE server_id = ? AND mod_id = ?', [serverId, modId]);
      this.db.save();
      return { success: true, message: 'Mod reactivated' };
    }

    // Get mod details first
    let modName = '';
    try {
      const details = await this.getModDetails(modId, server.game_type);
      modName = details?.name || `Mod ${modId}`;
    } catch (_) {}

    // Insert/update record
    this.db.run(
      `INSERT INTO server_mods (server_id, mod_id, mod_name, game_type, installed, active)
       VALUES (?, ?, ?, ?, 0, 1)
       ON CONFLICT(server_id, mod_id) DO UPDATE SET active = 1, mod_name = ?`,
      [serverId, modId, modName, server.game_type, modName]
    );
    this.db.save();

    // Download mod
    if (server.game_type === 'ASE') {
      await this.steamcmd.installModsASE(server.install_path, [modId]);
    } else {
      // ASA: download via CurseForge API or manual download
      await this._installCurseForgeMod(server.install_path, modId);
    }

    this.db.run(
      "UPDATE server_mods SET installed = 1, updated_at = datetime('now','localtime') WHERE server_id = ? AND mod_id = ?",
      [serverId, modId]
    );
    this.db.save();

    // Aktywuj mod w konfiguracji serwera (ActiveMods w GameUserSettings.ini)
    this._writeActiveMods(server);

    console.log(`[ModManager] Installed mod ${modId} (${modName}) on server ${serverId}`);
    return { success: true, modId, modName };
  }

  async removeMod(serverId, modId) {
    this.db.run('UPDATE server_mods SET active = 0 WHERE server_id = ? AND mod_id = ?', [serverId, modId]);
    this.db.save();
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (server) this._writeActiveMods(server);
    return { success: true };
  }

  async updateMod(serverId, modId) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) throw new Error(`Server ${serverId} not found`);

    if (server.game_type === 'ASE') {
      await this.steamcmd.installModsASE(server.install_path, [modId]);
    } else {
      await this._installCurseForgeMod(server.install_path, modId);
    }

    this.db.run(
      "UPDATE server_mods SET updated_at = datetime('now','localtime') WHERE server_id = ? AND mod_id = ?",
      [serverId, modId]
    );
    this.db.save();

    return { success: true };
  }

  async updateAllMods(serverId) {
    const mods = await this.getActiveModIds(serverId);
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) throw new Error(`Server ${serverId} not found`);

    if (server.game_type === 'ASE' && mods.length > 0) {
      await this.steamcmd.installModsASE(server.install_path, mods);
    }

    this.db.run(
      "UPDATE server_mods SET updated_at = datetime('now','localtime') WHERE server_id = ?",
      [serverId]
    );
    this.db.save();

    return { success: true, updatedCount: mods.length };
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEAM WORKSHOP (ASE)
  // ═══════════════════════════════════════════════════════════════════

  async _searchSteamWorkshop(query) {
    // 1. Jeśli podano klucz Steam Web API — używamy oficjalnego API
    const key = (this.db && this.db.getSetting && this.db.getSetting('steam_api_key')) || '';
    if (key) {
      try {
        const data = await this._httpGet(
          `https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?key=${encodeURIComponent(key)}&query_type=0&page=1&numperpage=20&appid=346110&search_text=${encodeURIComponent(query)}&return_short_description=true`
        );
        const json = JSON.parse(data);
        const results = (json.response?.publishedfiledetails || []).map(d => ({
          id: d.publishedfileid,
          name: d.title,
          preview: d.preview_url,
          size: d.file_size,
        }));
        return { results, source: 'Steam Web API' };
      } catch (_) { /* fallthrough do anonimowego */ }
    }
    // 2. Anonimowe przeglądanie przez steamcommunity.com (bez logowania/klucza)
    return this._searchSteamWorkshopAnonymous(query);
  }

  async _searchSteamWorkshopAnonymous(query) {
    // Steam renderuje wyniki warsztatu po stronie klienta (JS), więc proste
    // parsowanie HTML nie zawsze zwraca pozycje. Próbujemy oficjalnego AJAX-a.
    try {
      const body = new URLSearchParams({
        appid: '346110',
        searchtext: query,
        childpublishedfileid: '0',
        browsesort: 'textsearch',
        section: 'readytouseitems',
        days_to_filter_start: '0',
        days_to_filter_end: '0',
        sortmethod: 'textsearch',
        actualsort: 'textsearch',
        p: '1',
        numperpage: '30',
      }).toString();
      const data = await this._httpGet(
        'https://steamcommunity.com/sharedfiles/ajaxgetworkshops/',
        'POST',
        body,
        { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' }
      );
      const json = JSON.parse(data);
      const resultsHtml = json?.results_html || '';
      // Linki do pozycji warsztatu: .../sharedfiles/filedetails/?id=NNN
      const re = /filedetails\/\?id=(\d+)/g;
      const results = [];
      const seen = new Set();
      let m;
      while ((m = re.exec(resultsHtml)) !== null && results.length < 20) {
        if (!seen.has(m[1])) { seen.add(m[1]); results.push({ id: m[1], name: `Mod ${m[1]}` }); }
      }
      if (results.length) return { results, source: 'Steam Community (anonimowo)' };
      return {
        results: [],
        note: 'Anonimowa wyszukiwarka Steam zwraca obecnie tylko podpowiedzi gier (Steam ładuje wyniki przez JS). Wpisz numer (ID) moda ręcznie i kliknij Install — instalacja po ID działa bez klucza API. Pełna wyszukiwarka: Settings → API Keys (Steam Web API).',
      };
    } catch (e) {
      return { results: [], error: e.message };
    }
  }

  async _getSteamWorkshopDetails(modId) {
    try {
      const data = await this._httpGet(
        `https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/`,
        'POST',
        `itemcount=1&publishedfileids[0]=${modId}`,
        { 'Content-Type': 'application/x-www-form-urlencoded' }
      );
      const json = JSON.parse(data);
      if (json.response?.publishedfiledetails?.length) {
        const d = json.response.publishedfiledetails[0];
        return {
          id: d.publishedfileid,
          name: d.title,
          description: d.description,
          previewUrl: d.preview_url,
          fileSize: d.file_size,
          author: d.creator,
        };
      }
      return { id: modId, name: `Mod ${modId}` };
    } catch (e) {
      return { id: modId, name: `Mod ${modId}` };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // CURSEFORGE (ASA)
  // ═══════════════════════════════════════════════════════════════════

  async _searchCurseForge(query) {
    const key = (this.db && this.db.getSetting && this.db.getSetting('curseforge_api_key')) || '';
    if (!key) return { results: [], note: 'CurseForge API key needed (Settings → API Keys)' };
    try {
      const data = await this._httpGet(
        `https://api.curseforge.com/v1/mods/search?gameId=470014&searchFilter=${encodeURIComponent(query)}&pageSize=20`,
        'GET',
        null,
        { 'x-api-key': key }
      );
      const json = JSON.parse(data);
      const results = (json.data || []).map(m => ({ id: String(m.id), name: m.name, summary: m.summary }));
      return { results, source: 'CurseForge' };
    } catch (e) {
      return { results: [], error: e.message };
    }
  }

  async _getCurseForgeModDetails(modId) {
    const key = (this.db && this.db.getSetting && this.db.getSetting('curseforge_api_key')) || '';
    if (!key) return { id: modId, name: `Mod ${modId}` };
    try {
      const data = await this._httpGet(
        `https://api.curseforge.com/v1/mods/${modId}`,
        'GET',
        null,
        { 'x-api-key': key }
      );
      const json = JSON.parse(data);
      return {
        id: json.data?.id,
        name: json.data?.name,
        summary: json.data?.summary,
        downloadCount: json.data?.downloadCount,
        author: json.data?.authors?.[0]?.name,
        logoUrl: json.data?.logo?.url,
      };
    } catch (e) {
      return { id: modId, name: `Mod ${modId}` };
    }
  }

  async _installCurseForgeMod(installPath, modId) {
    // CurseForge mods for ASA are installed differently:
    // They go to ShooterGame/Content/Mods/ or use the in-game mod browser
    const modsDir = path.join(installPath, 'ShooterGame', 'Content', 'Mods');
    if (!fs.existsSync(modsDir)) {
      fs.mkdirSync(modsDir, { recursive: true });
    }

    // For ASA, mark the mod as "needs manual download via CurseForge"
    // The actual download requires CurseForge API authentication
    console.log(`[ModManager] ASA mod ${modId} marked for installation. Use CurseForge for download.`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // HTTP HELPERS
  // ═══════════════════════════════════════════════════════════════════

  _httpGet(url, method = 'GET', body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method,
        headers: { 'User-Agent': 'ArkAdminManager/1.0', ...headers },
        timeout: 15000,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return resolve(this._httpGet(res.headers.location, method, body, headers));
          }
          resolve(data);
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

      if (body) req.write(body);
      req.end();
    });
  }
}

module.exports = ModManager;
