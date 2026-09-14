// Copyright (c) 2026 Kruzio
// Licensed under the PolyForm Noncommercial License 1.0.0.
// Non-commercial use only. Commercial use and selling of this code are prohibited.
// Derivative works must retain this license and link to: https://github.com/kruzio1985/Ark-Admin-Manager
// https://polyformproject.org/licenses/noncommercial/1.0.0/

/**
 * Ark Admin Manager — Server Manager
 * Zarządza cyklem życia serwerów ARK: instalacja, start, stop, restart, update, monitoring
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

class ServerManager {
  constructor(db, steamcmd, rcon, configParser, serversDir) {
    this.db = db;
    this.steamcmd = steamcmd;
    this.rcon = rcon;
    this.configParser = configParser;
    this.serversDir = serversDir;
    this.runningProcesses = new Map(); // serverId → ChildProcess
    this.consoleBuffers = new Map();   // serverId → string[]
    this.rconConnections = new Map();  // serverId → rconConnId
    this._manualStops = new Set();     // serverId — celowo zatrzymane (Guardian ich nie rusza)
    this._expectedRunning = new Set(); // serverId — oczekujemy, że działa (crash = restart)
    this._startStatusMonitor();        // Periodic live status check
  }

  _startStatusMonitor() {
    // Every 30 seconds, check if servers are actually running
    this._statusInterval = setInterval(() => {
      try {
        this.syncLiveStatus();
        this.checkWelcomePacks();
      } catch (_) {}
    }, 30000);
    // Guardian self-healing: co 60s sprawdza crashe / auto-start
    this._guardianInterval = setInterval(() => {
      try {
        this.checkGuardian(false);
      } catch (_) {}
    }, 60000);
    // Boot check po 15s (auto_start)
    const bootTimer = setTimeout(() => {
      try { this.checkGuardian(true); } catch (_) {}
    }, 15000);
    if (bootTimer.unref) bootTimer.unref();
    // Auto-update check po 90s (nie koliduje z autostartem)
    const autoUpdateTimer = setTimeout(() => {
      try { this.checkAutoUpdates(); } catch (_) {}
    }, 90000);
    if (autoUpdateTimer.unref) autoUpdateTimer.unref();
    // Don't keep process alive just for this
    if (this._statusInterval.unref) this._statusInterval.unref();
    if (this._guardianInterval.unref) this._guardianInterval.unref();
  }

  /**
   * Guardian self-healing:
   * - auto_restart=1 → restartuje serwer, który padł (był uruchomiony, proces zniknął).
   * - auto_start=1   → uruchamia serwer przy starcie aplikacji / gdy nie działa (keep-alive).
   * Celowo zatrzymane (przez stopServer) są pomijane.
   */
  async checkGuardian(isBoot = false) {
    const servers = this.db.query('SELECT * FROM servers WHERE auto_restart = 1 OR auto_start = 1');
    if (!servers.length) return;

    for (const s of servers) {
      if (this._manualStops.has(s.id)) continue; // admin zatrzymał celowo
      const isRunning = this._isServerRunning(s);

      if (isRunning) {
        if (s.status !== 'running') {
          this.db.run("UPDATE servers SET status = 'running' WHERE id = ?", [s.id]);
          this.db.save();
        }
        this._expectedRunning.add(s.id);
        continue;
      }

      // Proces nie działa
      if (s.auto_restart && this._expectedRunning.has(s.id)) {
        // Był uruchomiony → padł → restart
        console.log(`[Guardian] "${s.name}" padł — auto-restart`);
        this.db.logActivity(s.id, 'crashed', 0, 'Serwer padł — auto-restart (Guardian)');
        try { await this.startServer(s.id); } catch (e) { console.error(`[Guardian] restart ${s.name} fail:`, e.message); }
      } else if (s.auto_start && s.status === 'stopped') {
        // Auto-start (boot lub keep-alive) — nie ruszamy installing/updating
        console.log(`[Guardian] "${s.name}" auto-start (${isBoot ? 'boot' : 'keep-alive'})`);
        this.db.logActivity(s.id, 'auto_started', 0, 'Auto-start (Guardian)');
        try { await this.startServer(s.id); } catch (e) { console.error(`[Guardian] autostart ${s.name} fail:`, e.message); }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // SERVER CRUD
  // ═══════════════════════════════════════════════════════════════════

  async listServers() {
    return this.db.query(
      'SELECT s.*, sc.config_json FROM servers s LEFT JOIN server_config sc ON s.id = sc.server_id ORDER BY s.name'
    );
  }

  async getServer(id) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server) return null;

    const config = await this.configParser.getConfig(id);
    const mods = this.db.query('SELECT * FROM server_mods WHERE server_id = ?', [id]);

    return { ...server, config, mods };
  }

  async createServer(data) {
    let { name, game_type, map_name, install_path, port, query_port, rcon_port,
            max_players, server_password, admin_password, cluster_id, server_args,
            use_battleye, raw_sockets } = data;

    const gt = game_type || 'ASE';
    const isASA = gt === 'ASA';
    // Domyślne porty zależne od gry (ASE vs ASA) — NIE kolidują z Dune/SCUM/Rust
    const defPort = isASA ? 7850 : 7790;
    const defQuery = isASA ? 27050 : 27017;
    const defRcon = isASA ? 32400 : 32330;

    // Auto-wykrywanie mapy z nazwy (np. nazwa "Ragnarok" → mapa Ragnarok)
    if (!map_name && name) {
      const knownMaps = ['TheIsland','TheCenter','ScorchedEarth','Ragnarok','Aberration','Extinction','Valguero','Genesis','CrystalIsles','Genesis2','LostIsland','Fjordur','ClubARK'];
      const nm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const m of knownMaps) {
        if (nm.includes(m.toLowerCase()) || m.toLowerCase().includes(nm)) { map_name = m; break; }
      }
    }

    // NIGDY nie hardkoduj TheIsland — wymagaj jawnej mapy
    if (!map_name) {
      throw new Error('Nie można ustalić mapy serwera — wybierz mapę ręcznie w oknie edycji.');
    }

    this.db.run(
      `INSERT INTO servers (name, game_type, map_name, install_path, port, query_port, rcon_port, max_players, server_password, admin_password, cluster_id, server_args)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, gt, map_name, install_path || '',
       port || defPort, query_port || defQuery, rcon_port || defRcon,
       max_players || 70, server_password || '', admin_password || '', cluster_id || '',
       server_args || '']
    );
    this.db.save();

    // Get the new server ID using a proper query (more reliable than last_insert_rowid)
    const rows = this.db.query('SELECT id FROM servers ORDER BY id DESC LIMIT 1');
    const serverId = rows[0]?.id;
    if (!serverId) throw new Error('Failed to get new server ID');

    // Create default config
    const defaults = this.configParser.getDefaults(gt);
    await this.configParser.saveConfig(serverId, defaults);

    // Create default messages (INSERT OR IGNORE in case of conflict)
    this.db.run(
      `INSERT OR IGNORE INTO server_messages (server_id) VALUES (?)`, [serverId]
    );
    this.db.save();

    this.db.logActivity(serverId, 'created', 0, `Server "${name}" created`);
    console.log(`[ServerManager] Created server "${name}" (id=${serverId})`);

    return this.getServer(serverId);
  }

  async updateServer(id, data) {
    const fields = ['name', 'game_type', 'map_name', 'install_path', 'port', 'query_port',
                    'rcon_port', 'max_players', 'server_password', 'admin_password',
                    'cluster_id', 'server_args', 'use_battleye', 'raw_sockets',
                    'auto_start', 'auto_restart', 'auto_update',
                    'alt_save_dir', 'cpu_affinity', 'cpu_priority'];
    const sets = [];
    const values = [];

    for (const f of fields) {
      if (data[f] !== undefined) {
        sets.push(`${f} = ?`);
        values.push(data[f]);
      }
    }

    if (sets.length > 0) {
      sets.push("updated_at = datetime('now','localtime')");
      this.db.run(`UPDATE servers SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);
      this.db.save();
    }

    this.db.logActivity(id, 'updated', 0, 'Server configuration updated');
    return this.getServer(id);
  }

  async deleteServer(id) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server) throw new Error(`Server ${id} not found`);

    // Stop if running
    if (this.runningProcesses.has(id)) {
      await this.stopServer(id);
    }

    this.db.run('DELETE FROM servers WHERE id = ?', [id]);
    this.db.save();

    console.log(`[ServerManager] Deleted server "${server.name}" (id=${id})`);
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════
  // SERVER LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════

  async installServer(id) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server) throw new Error(`Server ${id} not found`);

    const installPath = server.install_path || path.join(this.serversDir, server.game_type, server.name);
    if (!fs.existsSync(installPath)) {
      fs.mkdirSync(installPath, { recursive: true });
    }

    // Update install path in DB
    this.db.run('UPDATE servers SET install_path = ? WHERE id = ?', [installPath, id]);
    this.db.save();

    // Ensure SteamCMD exists first
    const steamExe = path.join(this.steamcmd.steamDir, 'steamcmd.exe');
    if (!fs.existsSync(steamExe)) {
      // Auto-install SteamCMD
      console.log('[ServerManager] SteamCMD not found, installing...');
      try {
        await this.steamcmd.installSteamCMD();
      } catch (e) {
        throw new Error(`SteamCMD installation failed: ${e.message}. Go to Settings → Install SteamCMD manually.`);
      }
    }

    // Check again
    if (!fs.existsSync(steamExe)) {
      throw new Error(`SteamCMD not found at ${steamExe}. Please install it from Settings first.`);
    }

    const appId = this.steamcmd.getAppId(server.game_type);
    const name = server.name || 'ARK Server';

    // TWORZYMY PLIK .BAT I OTWIERAMY W WIDOCZNYM OKNIE CMD
    // (dokładnie tak jak w SCUM Admin Manager - działa niezawodnie)
    const batPath = path.join(this.steamcmd.steamDir, `_install_ark_${id}.bat`);
    const batContent = `@echo off
title Instalacja ARK Server: ${name}
echo ============================================
echo   ARK Admin Manager - Instalacja Serwera
echo ============================================
echo.
echo   Gra: ${server.game_type}
echo   Mapa: ${server.map_name}
echo   AppID: ${appId}
echo   Folder: ${installPath}
echo.
echo   SteamCMD pobiera pliki serwera...
echo   To moze potrwac 20-60 minut (ok. 30 GB).
echo ============================================
echo.
"${steamExe}" +force_install_dir "${installPath}" +login anonymous +app_update ${appId} validate +quit
echo.
echo ============================================
echo   Instalacja zakonczona (kod: %ERRORLEVEL%)
echo   Mozesz zamknac to okno.
echo ============================================
pause
`;
    fs.writeFileSync(batPath, batContent);

    // Otwórz plik .bat w nowym widocznym oknie CMD
    const { exec } = require('child_process');
    const cmd = `start "ARK Install: ${name}" cmd /k "${batPath}"`;
    exec(cmd, { shell: true, cwd: this.steamcmd.steamDir }, (err) => {
      if (err) console.error('[ServerManager] Error launching install CMD:', err.message);
      else console.log(`[ServerManager] SteamCMD launched in visible window for "${name}"`);
    });

    // Set status to installing immediately
    this.db.run("UPDATE servers SET status = 'installing' WHERE id = ?", [id]);
    this.db.save();
    this.db.logActivity(id, 'installing', 0, `SteamCMD launched for ${server.game_type} to ${installPath}`);

    // Create initial INI files (even before install completes)
    try {
      const config = await this.configParser.getConfig(id);
      await this.configParser.saveConfig(id, config);
    } catch (_) {}

    console.log(`[ServerManager] Installation started for "${name}" in visible CMD window`);
    return { success: true, installPath, message: 'SteamCMD launched in a separate window. Monitor progress there.' };
  }

  async startServer(id) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server) throw new Error(`Server ${id} not found`);
    if (this.runningProcesses.has(id)) throw new Error('Server is already running');

    const isASA = server.game_type === 'ASA';

    // Ensure config is written
    const config = await this.configParser.getConfig(id);
    await this.configParser.saveConfig(id, config);

    // Build launch command
    const exeName = isASA ? 'ArkAscendedServer.exe' : 'ShooterGameServer.exe';
    const exePath = isASA
      ? path.join(server.install_path, 'ShooterGame', 'Binaries', 'Win64', exeName)
      : path.join(server.install_path, 'ShooterGame', 'Binaries', 'Win64', exeName);

    if (!fs.existsSync(exePath)) {
      throw new Error(`Server executable not found: ${exePath}. Install the server first.`);
    }

    const args = this._buildLaunchArgs(server, config, isASA);

    console.log(`[ServerManager] Starting ${server.name}...`);
    console.log(`[ServerManager] Command: ${exePath} ${args.join(' ')}`);

    this.consoleBuffers.set(id, []);

    const workDir = path.dirname(exePath);
    
    // TWO-BAT approach (proven working):
    // 1. Server BAT: cd, run exe, show error code, pause — keeps window open
    // 2. Manager BAT: opens server BAT in cmd /k window
    
    const serverBatPath = path.join(workDir, `_server_${id}.bat`);
    const serverBatContent = `@echo off
cd /d "${workDir}"
echo ============================================
echo   ARK Server: ${server.name}
echo   Mapa: ${server.map_name} - Port: ${server.port}
echo ============================================
echo.
"${exePath}" ${args.join(' ')}
echo.
echo ============================================
echo Serwer zatrzymany (kod: %ERRORLEVEL%)
echo ============================================
pause
`;
    fs.writeFileSync(serverBatPath, serverBatContent);

    const mgrBatPath = path.join(workDir, `_start_${id}.bat`);
    const mgrBatContent = `@echo off
title ARK Manager: ${server.name}
echo ============================================
echo   ARK Server: ${server.name}
echo   Mapa: ${server.map_name}  -  Port: ${server.port}
echo   Game: ${server.game_type}
echo ============================================
echo.
if not exist "${exePath}" (
  echo [ERROR] Server EXE not found!
  echo Path: ${exePath}
  pause
  exit /b 1
)
echo WorkDir: ${workDir}
echo Args:   ${args.join(' ')}
echo.
echo Uruchamianie serwera w nowym oknie...
start "ARK Server: ${server.name}" cmd /k "${serverBatPath}"
echo.
echo Serwer wystartowal w osobnym oknie CMD.
echo Mozesz zamknac TO okno menadzera.
pause
`;
    fs.writeFileSync(mgrBatPath, mgrBatContent);

    const { exec } = require('child_process');
    const cmd = `start "ARK: ${server.name}" cmd /k "${mgrBatPath}"`;
    exec(cmd, { shell: true, cwd: path.dirname(exePath) }, (err) => {
      if (err) console.error('[ServerManager] Error launching server CMD:', err.message);
    });

    // Track as running
    this.runningProcesses.set(id, { pid: -1, batPath: mgrBatPath });
    this.db.run("UPDATE servers SET status = 'running' WHERE id = ?", [id]);
    this.db.save();
    this.db.logActivity(id, 'started', 0, 'Server started in CMD window');

    // Auto-connect RCON after delay
    setTimeout(async () => {
      try {
        if (server.rcon_port && server.admin_password) {
          const connId = await this.rcon.connect('127.0.0.1', server.rcon_port, server.admin_password || '');
          this.rconConnections.set(id, connId);
          console.log(`[ServerManager] RCON connected to ${server.name}`);
        }
      } catch (e) {
        console.log(`[ServerManager] RCON not ready yet for ${server.name}:`, e.message);
      }
    }, 30000); // Wait 30s for server to start

    return { success: true, message: 'Server launched in separate CMD window' };
  }

  _killServerProcess(server) {
    const exeName = server.game_type === 'ASA' ? 'ArkAscendedServer.exe' : 'ShooterGameServer.exe';
    const root = (server.install_path || '').toLowerCase();
    if (!root) return false;
    try {
      const { execSync } = require('child_process');
      // BEZ zagnieżdżonych cudzysłowów (Where-Object zamiast -Filter) — inaczej cmd.exe psuje escaping
      const script = `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq '${exeName}' -and $_.ExecutablePath -and $_.ExecutablePath.ToLower().StartsWith('${root}') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${script}"`, { timeout: 20000, windowsHide: true });
      return true;
    } catch (_) { return false; }
  }

  async stopServer(id) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server) throw new Error(`Server ${id} not found`);

    // 1. Graceful shutdown przez RCON (verified 2-stage save barrier)
    let graceful = false;
    let saveVerified = false;
    try {
      let rconConnId = this.rconConnections.get(id);
      if (!rconConnId && server.rcon_port && server.admin_password) {
        rconConnId = await this.rcon.connect('127.0.0.1', server.rcon_port, server.admin_password);
      }
      if (rconConnId) {
        const before = this._countWorldSaves(server);
        await this.rcon.sendCommand(rconConnId, 'admincheat SaveWorld');
        // Weryfikacja: czekaj aż w logu pojawi się nowy "World Save Complete" (max 30s)
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 2000));
          if (this._countWorldSaves(server) > before) { saveVerified = true; break; }
        }
        await this.rcon.sendCommand(rconConnId, 'admincheat DoExit');
        this.rcon.disconnect(rconConnId);
        this.rconConnections.delete(id);
        graceful = true;
        console.log(`[ServerManager] Graceful shutdown (SaveWorld${saveVerified ? ' ✓zweryfikowany' : ' ⚠bez potwierdzenia'} + DoExit) dla ${server.name}`);
      }
    } catch (_) {}

    // 2. Poczekaj na łagodne zamknięcie
    if (graceful) await new Promise(r => setTimeout(r, 5000));

    // 3. Force-kill TYLKO ten serwer (po ścieżce instalacji) — jeśli wciąż działa
    this._killServerProcess(server);
    console.log(`[ServerManager] Stopped: ${server.name} (${server.install_path})`);

    this.runningProcesses.delete(id);
    this.db.run("UPDATE servers SET status = 'stopped' WHERE id = ?", [id]);
    this.db.save();
    this.db.logActivity(id, 'stopped', 0, 'Server stopped');
    return { success: true, message: 'Server stopped.' };
  }

  /** Liczy wpisy "World Save Complete" w głównym logu (do weryfikacji zapisu przed stopem). */
  _countWorldSaves(server) {
    try {
      const logPath = path.join(server.install_path || '', 'ShooterGame', 'Saved', 'Logs', 'ShooterGame.log');
      if (!fs.existsSync(logPath)) return 0;
      const content = fs.readFileSync(logPath, 'utf8');
      return (content.match(/World Save Complete/g) || []).length;
    } catch { return 0; }
  }

  /** Tribe log viewer: lista plemion (.arktribe) + zdarzenia plemienne z logu. */
  getTribeLog(id) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server || !server.install_path) throw new Error('Server not installed');
    const saved = path.join(server.install_path, 'ShooterGame', 'Saved');
    const tribes = [];
    if (fs.existsSync(saved)) {
      try {
        for (const e of fs.readdirSync(saved)) {
          if (!e.endsWith('.arktribe')) continue;
          const full = path.join(saved, e);
          let size = 0, mtime = null;
          try { const st = fs.statSync(full); size = st.size; mtime = st.mtime; } catch {}
          tribes.push({ name: e.replace('.arktribe', ''), fileName: e, size, modified: mtime });
        }
      } catch {}
    }
    const events = [];
    const logPath = path.join(server.install_path, 'ShooterGame', 'Saved', 'Logs', 'ShooterGame.log');
    if (fs.existsSync(logPath)) {
      try {
        const lines = fs.readFileSync(logPath, 'utf8').split('\n');
        const tail = lines.slice(-2000);
        const re = /tribe|killed by|tamed|joined the|destroyed|demolished/i;
        for (const l of tail) {
          if (re.test(l)) events.push(l.trim());
        }
        events.reverse();
      } catch {}
    }
    return { serverId: id, serverName: server.name, tribes, events: events.slice(0, 200) };
  }

  // ═══════════════════════════════════════════════════════════════════
  // ASA DEPOT ROLLBACK (pobranie starszego builda przez SteamCMD)
  // ═══════════════════════════════════════════════════════════════════

  async rollbackServer(id, manifestId, steamUser, steamPass) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server) throw new Error(`Server ${id} not found`);
    if (server.game_type !== 'ASA') throw new Error('Rollback depotów działa tylko dla ASA');
    if (!manifestId) throw new Error('Podaj Manifest ID depotu (np. 681058914540629286)');
    if (!steamUser || !steamPass) throw new Error('Podaj login i hasło Steam (konto musi posiadać ARK)');
    const steamExe = path.join(this.steamcmd.steamDir, 'steamcmd.exe');
    if (!fs.existsSync(steamExe)) throw new Error('SteamCMD not installed');

    const batPath = path.join(this.steamcmd.steamDir, `_rollback_${id}.bat`);
    const batContent = `@echo off
title ARK Rollback: ${server.name}
echo Pobieranie depotu 2430931 manifest ${manifestId}...
"${steamExe}" +login ${steamUser} ${steamPass} +download_depot 2430930 2430931 ${manifestId} +quit
echo.
echo Pliki depotu trafily do: steamapps\\content\\app_2430930\\depot_2430931\\
echo Skopiuj je do folderu serwera (ShooterGame) przed startem.
pause
`;
    fs.writeFileSync(batPath, batContent);
    const { exec } = require('child_process');
    exec(`start "ARK Rollback: ${server.name}" cmd /k "${batPath}"`, { shell: true, cwd: this.steamcmd.steamDir });
    this.db.logActivity(id, 'rollback', 0, `Rollback depotu 2430931 manifest ${manifestId}`);
    return { success: true, message: 'Rollback uruchomiony w oknie CMD (wymaga Steam Guard, jeśli włączony)' };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PLUGIN MANAGER (AsaApi / plugins)
  // ═══════════════════════════════════════════════════════════════════

  _pluginsDir(server) {
    return path.join(server.install_path || '', 'ShooterGame', 'Binaries', 'Win64', 'plugins');
  }

  listPlugins(serverId) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server?.install_path) throw new Error('Server not installed');
    const dir = this._pluginsDir(server);
    const files = [];
    if (fs.existsSync(dir)) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        let size = 0;
        try { if (e.isFile()) size = fs.statSync(path.join(dir, e.name)).size; } catch {}
        files.push({ name: e.name, isDirectory: e.isDirectory(), size });
      }
    }
    return { serverId, pluginsDir: dir, exists: fs.existsSync(dir), files };
  }

  deletePlugin(serverId, fileName) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server?.install_path) throw new Error('Server not installed');
    const dir = this._pluginsDir(server);
    const full = path.join(dir, fileName);
    if (!fs.existsSync(full)) throw new Error('Nie znaleziono pliku wtyczki');
    if (fs.statSync(full).isDirectory()) fs.rmSync(full, { recursive: true });
    else fs.unlinkSync(full);
    return { success: true };
  }

  async installAsaApi(serverId) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server?.install_path) throw new Error('Server not installed');
    if (server.game_type !== 'ASA') throw new Error('AsaApi działa tylko dla ASA');
    // Pobierz informacje o najnowszym release z GitHub API
    const https = require('https');
    const release = await new Promise((resolve, reject) => {
      const req = https.get('https://api.github.com/repos/ArkServerApi/AsaApi/releases/latest', {
        headers: { 'User-Agent': 'ArkAdminManager' }, timeout: 15000,
      }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error('Brak odpowiedzi GitHub API')); } });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout GitHub API')); });
    });
    const asset = (release.assets || []).find(a => /\.zip$/i.test(a.name));
    if (!asset) throw new Error('Nie znaleziono archiwum .zip w release AsaApi');
    const dest = path.join(this.steamcmd.steamDir, '_asaapi.zip');
    await this._downloadFileHttps(asset.browser_download_url, dest);
    // Rozpakuj do Binaries/Win64
    const target = path.join(server.install_path, 'ShooterGame', 'Binaries', 'Win64');
    const { execSync } = require('child_process');
    execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${dest}' -DestinationPath '${target}' -Force"`, { timeout: 120000, windowsHide: true });
    this.db.logActivity(serverId, 'asaapi_install', 0, `AsaApi ${release.tag_name} zainstalowany`);
    return { success: true, version: release.tag_name, asset: asset.name };
  }

  _downloadFileHttps(url, dest) {
    const fs2 = require('fs');
    const https = require('https');
    return new Promise((resolve, reject) => {
      const file = fs2.createWriteStream(dest);
      const req = https.get(url, { headers: { 'User-Agent': 'ArkAdminManager' }, timeout: 60000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume(); file.close();
          return resolve(this._downloadFileHttps(res.headers.location, dest));
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout')); });
    });
  }

  async restartServer(id) {
    await this.stopServer(id);
    await new Promise(r => setTimeout(r, 5000));
    return this.startServer(id);
  }

  async updateServerFiles(id) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server) throw new Error(`Server ${id} not found`);
    if (!server.install_path) throw new Error('Server not installed yet');

    const steamExe = path.join(this.steamcmd.steamDir, 'steamcmd.exe');
    if (!fs.existsSync(steamExe)) {
      throw new Error('SteamCMD not installed. Go to Settings → Install SteamCMD.');
    }

    // MASTER/FOLLOWER: zatrzymaj inne DZIAŁAJĄCE serwery współdzielące install_path
    const shared = this.db.query(
      "SELECT * FROM servers WHERE install_path = ? AND id != ? AND status = 'running'",
      [server.install_path, id]
    );
    for (const s of shared) {
      try { await this.stopServer(s.id); } catch (e) { console.error(`[MASTER] stop shared ${s.name} fail:`, e.message); }
    }
    if (shared.length) {
      this.db.logActivity(id, 'update_coordination', 0, `MASTER/FOLLOWER: zatrzymano ${shared.length} współdzielonych serwerów przed update`);
    }

    const appId = this.steamcmd.getAppId(server.game_type);
    const name = server.name || 'ARK Server';

    // Create BAT file for update
    const batPath = path.join(this.steamcmd.steamDir, `_update_ark_${id}.bat`);
    const batContent = `@echo off
title Aktualizacja ARK Server: ${name}
echo ============================================
echo   ARK Admin Manager - Aktualizacja Serwera
echo ============================================
echo   Gra: ${server.game_type}  -  AppID: ${appId}
echo   Folder: ${server.install_path}
echo.
"${steamExe}" +force_install_dir "${server.install_path}" +login anonymous +app_update ${appId} validate +quit
echo.
echo ============================================
echo   Aktualizacja zakonczona (kod: %ERRORLEVEL%)
pause
`;
    fs.writeFileSync(batPath, batContent);

    const { exec } = require('child_process');
    const cmd = `start "ARK Update: ${name}" cmd /k "${batPath}"`;
    exec(cmd, { shell: true, cwd: this.steamcmd.steamDir });

    this.db.run("UPDATE servers SET status = 'updating' WHERE id = ?", [id]);
    this.db.save();
    this.db.logActivity(id, 'updating', 0, 'SteamCMD update launched');

    return { success: true, message: 'Update launched in CMD window' };
  }

  // ═══════════════════════════════════════════════════════════════════
  // UPDATE CHECK (Steam build) + AUTO-UPDATE
  // ═══════════════════════════════════════════════════════════════════

  _readInstalledBuildid(appId) {
    const manifest = path.join(this.steamcmd.steamDir, 'steamapps', `appmanifest_${appId}.acf`);
    if (!fs.existsSync(manifest)) return null;
    try {
      const content = fs.readFileSync(manifest, 'utf8');
      const m = content.match(/"buildid"\s*"(\d+)"/);
      return m ? m[1] : null;
    } catch { return null; }
  }

  _steamUpToDateCheck(appId, buildid) {
    return new Promise((resolve) => {
      const url = `https://api.steampowered.com/ISteamApps/UpToDateCheck/v1/?appid=${appId}&version=${buildid}`;
      const req = https.get(url, { timeout: 10000 }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            resolve(j?.response || { up_to_date: true, required_version: buildid });
          } catch { resolve({ up_to_date: true, required_version: buildid }); }
        });
      });
      req.on('error', () => resolve({ up_to_date: true, required_version: buildid }));
      req.on('timeout', () => { req.destroy(); resolve({ up_to_date: true, required_version: buildid }); });
    });
  }

  async checkUpdateForServer(serverId) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) throw new Error(`Server ${serverId} not found`);
    const appId = this.steamcmd.getAppId(server.game_type);
    const installed = this._readInstalledBuildid(appId);
    if (!installed) {
      return { appId, installedBuildid: null, updateAvailable: false, upToDate: false, message: 'Serwer nie zainstalowany (brak appmanifest)' };
    }
    const check = await this._steamUpToDateCheck(appId, installed);
    return {
      appId,
      installedBuildid: installed,
      requiredVersion: check.required_version,
      upToDate: !!check.up_to_date,
      updateAvailable: !check.up_to_date,
      message: check.up_to_date ? 'Serwer aktualny' : 'Dostępna aktualizacja',
    };
  }

  async checkAutoUpdates() {
    const servers = this.db.query('SELECT * FROM servers WHERE auto_update = 1 AND install_path IS NOT NULL');
    for (const s of servers) {
      try {
        const r = await this.checkUpdateForServer(s.id);
        if (r.updateAvailable) {
          console.log(`[AutoUpdate] "${s.name}" ma aktualizację → uruchamiam`);
          this.db.logActivity(s.id, 'auto_update', 0, 'Auto-update: dostępna aktualizacja');
          await this.updateServerFiles(s.id);
        }
      } catch (e) { console.error(`[AutoUpdate] ${s.name} fail:`, e.message); }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // CPU AFFINITY / PRIORITY (hardware allocation)
  // ═══════════════════════════════════════════════════════════════════

  _cpuMask(affinity) {
    if (!affinity) return null;
    const s = String(affinity).trim();
    if (!s) return null;
    if (s.includes(',')) {
      let mask = 0;
      for (const part of s.split(',')) {
        const n = parseInt(part.trim(), 10);
        if (!isNaN(n) && n >= 0 && n < 64) mask |= (1 << n);
      }
      return mask;
    }
    if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
    const n = parseInt(s, 10);
    return isNaN(n) ? null : n;
  }

  _priorityClass(priority) {
    const map = {
      idle: 'Idle', low: 'BelowNormal', belownormal: 'BelowNormal',
      normal: 'Normal', abovenormal: 'AboveNormal', high: 'High', realtime: 'RealTime',
    };
    return map[String(priority || 'normal').toLowerCase()] || 'Normal';
  }

  applyCpuSettings(id) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server) throw new Error(`Server ${id} not found`);
    const exeName = server.game_type === 'ASA' ? 'ArkAscendedServer.exe' : 'ShooterGameServer.exe';
    const root = (server.install_path || '').toLowerCase();
    const mask = this._cpuMask(server.cpu_affinity);
    const priorityClass = this._priorityClass(server.cpu_priority);
    if (mask === null && (!server.cpu_priority || server.cpu_priority === 'normal')) {
      return { success: true, message: 'Brak ustawień CPU do zastosowania' };
    }
    const { execSync } = require('child_process');
    const parts = [];
    parts.push(`$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq '${exeName}' -and $_.ExecutablePath -and $_.ExecutablePath.ToLower().StartsWith('${root}') } | Select-Object -First 1`);
    parts.push(`if (-not $p) { Write-Output 'NO_PROCESS'; return }`);
    parts.push(`$proc = Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue`);
    parts.push(`if (-not $proc) { Write-Output 'NO_PROCESS'; return }`);
    if (mask !== null) parts.push(`$proc.ProcessorAffinity = [IntPtr]${mask}`);
    if (server.cpu_priority && server.cpu_priority !== 'normal') parts.push(`$proc.PriorityClass = '${priorityClass}'`);
    parts.push(`Write-Output 'OK'`);
    const script = parts.join('; ');
    try {
      const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${script}"`, { timeout: 20000, windowsHide: true, encoding: 'utf8' });
      const ok = String(out).trim().includes('OK');
      if (!ok) return { success: false, message: 'Nie znaleziono działającego procesu serwera' };
      this.db.logActivity(id, 'cpu_set', 0, `CPU: affinity=${server.cpu_affinity || 'auto'} priority=${server.cpu_priority || 'normal'}`);
      return { success: true, message: 'Ustawienia CPU zastosowane', mask, priorityClass };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  /**
   * Zużycie RAM przez KAŻDY działający serwer ARK (po ścieżce instalacji).
   * Zwraca sumę + listę serwerów online z RAM w MB/GB.
   */
  async getServersResourceUsage() {
    const servers = this.db.query('SELECT id, name, game_type, install_path FROM servers');
    const result = { totalRamBytes: 0, totalRamMb: 0, totalRamGb: 0, servers: [] };
    let procs = [];
    try {
      const { execSync } = require('child_process');
      const script = `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'ShooterGameServer.exe' -or $_.Name -eq 'ArkAscendedServer.exe' } | ForEach-Object { [PSCustomObject]@{ Path=$_.ExecutablePath; WS=[int64]$_.WorkingSetSize } } | ConvertTo-Json -Compress`;
      const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${script}"`, { timeout: 20000, windowsHide: true, encoding: 'utf8' });
      const parsed = JSON.parse(String(out).trim());
      procs = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
    } catch (_) {}
    for (const s of servers) {
      if (!s.install_path) continue;
      const root = s.install_path.toLowerCase().replace(/[\\/]+$/, '') + '\\';
      const matches = procs.filter(p => p && p.Path && String(p.Path).toLowerCase().startsWith(root));
      const ramBytes = matches.reduce((a, p) => a + (Number(p.WS) || 0), 0);
      if (ramBytes > 0) {
        result.servers.push({
          id: s.id, name: s.name, game_type: s.game_type,
          ramBytes,
          ramMb: Math.round(ramBytes / 1048576),
          ramGb: +(ramBytes / 1073741824).toFixed(2),
        });
        result.totalRamBytes += ramBytes;
      }
    }
    result.totalRamMb = Math.round(result.totalRamBytes / 1048576);
    result.totalRamGb = +(result.totalRamBytes / 1073741824).toFixed(2);
    return result;
  }

  async validateServer(id) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server) throw new Error(`Server ${id} not found`);
    const issues = [];
    const checks = { passed: 0, failed: 0, warnings: 0 };
    
    // 1. Check installation
    if (!server.install_path || !fs.existsSync(server.install_path)) {
      issues.push({ severity: 'error', msg: 'Server not installed — no install folder found' });
      checks.failed++;
      return { valid: false, issues, checks, serverName: server.name };
    }
    checks.passed++;

    // 2. Check server executable
    const exeName = server.game_type === 'ASA' ? 'ArkAscendedServer.exe' : 'ShooterGameServer.exe';
    const exePath = path.join(server.install_path, 'ShooterGame', 'Binaries', 'Win64', exeName);
    if (!fs.existsSync(exePath)) {
      issues.push({ severity: 'error', msg: `Server .exe not found: ${exePath}. Run Install/Update first.` });
      checks.failed++;
    } else {
      checks.passed++;
      try {
        const stats = fs.statSync(exePath);
        issues.push({ severity: 'info', msg: `Server .exe OK (${(stats.size/1024/1024).toFixed(0)} MB)` });
      } catch(_) {}
    }

    // 3. Check config files
    const configDir = path.join(server.install_path, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
    const gameIni = path.join(configDir, 'Game.ini');
    const gusIni = path.join(configDir, 'GameUserSettings.ini');
    
    if (fs.existsSync(gameIni)) {
      checks.passed++;
      try {
        const content = fs.readFileSync(gameIni, 'utf8');
        if (content.length < 10) {
          issues.push({ severity: 'warning', msg: 'Game.ini exists but is almost empty' });
          checks.warnings++;
        }
      } catch(_) {}
    } else {
      issues.push({ severity: 'warning', msg: 'Game.ini not found — will be created on first start' });
      checks.warnings++;
    }

    if (fs.existsSync(gusIni)) {
      checks.passed++;
    } else {
      issues.push({ severity: 'warning', msg: 'GameUserSettings.ini not found — will be created on first start' });
      checks.warnings++;
    }

    // 4. Check Saved folder
    const savedDir = path.join(server.install_path, 'ShooterGame', 'Saved');
    if (fs.existsSync(savedDir)) {
      checks.passed++;
      const savedFiles = fs.readdirSync(savedDir);
      if (savedFiles.length === 0) {
        issues.push({ severity: 'info', msg: 'Saved folder is empty — world will be created on first start' });
      }
    } else {
      issues.push({ severity: 'warning', msg: 'Saved folder not found' });
      checks.warnings++;
    }

    // 5. Check mods folder
    const modsDir = path.join(server.install_path, 'ShooterGame', 'Content', 'Mods');
    const activeMods = this.db.query('SELECT COUNT(*) as cnt FROM server_mods WHERE server_id = ? AND active = 1', [id]);
    if (activeMods[0].cnt > 0 && !fs.existsSync(modsDir)) {
      issues.push({ severity: 'warning', msg: `${activeMods[0].cnt} mods configured but Mods folder not found` });
      checks.warnings++;
    }

    // 6. Check RCON password
    if (!server.admin_password) {
      issues.push({ severity: 'warning', msg: 'No admin password — RCON will not work. Set it in server settings.' });
      checks.warnings++;
    } else {
      checks.passed++;
    }

    // 7. Check port conflicts (basic)
    const allServers = this.db.query('SELECT id, name, port, query_port, rcon_port FROM servers WHERE id != ?', [id]);
    for (const other of allServers) {
      if (other.port === server.port) {
        issues.push({ severity: 'error', msg: `Port ${server.port} conflicts with server "${other.name}"` });
        checks.failed++;
      }
    }

    // 8. Check SteamCMD
    const steamExe = path.join(this.steamcmd.steamDir, 'steamcmd.exe');
    if (!fs.existsSync(steamExe)) {
      issues.push({ severity: 'warning', msg: `SteamCMD not found at ${this.steamcmd.steamDir} — updates will not work` });
      checks.warnings++;
    } else {
      checks.passed++;
    }

    // 9. Check disk space
    try {
      const { execSync } = require('child_process');
      const drive = server.install_path.substring(0, 2);
      const result = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace /value`, { encoding: 'utf8', timeout: 5000 });
      const freeMatch = result.match(/FreeSpace=(\d+)/);
      if (freeMatch) {
        const freeGB = parseInt(freeMatch[1]) / 1024 / 1024 / 1024;
        if (freeGB < 10) {
          issues.push({ severity: 'warning', msg: `Low disk space on ${drive}: ${freeGB.toFixed(1)} GB free. ARK needs ~30GB.` });
          checks.warnings++;
        } else {
          issues.push({ severity: 'info', msg: `Disk space OK: ${freeGB.toFixed(0)} GB free on ${drive}` });
          checks.passed++;
        }
      }
    } catch(_) {}

    return {
      valid: issues.filter(i => i.severity === 'error').length === 0,
      issues,
      checks,
      serverName: server.name,
      installPath: server.install_path,
    };
  }

  async stopAll() {
    const processes = [...this.runningProcesses.keys()];
    for (const id of processes) {
      try { await this.stopServer(id); } catch (e) { console.error(`Error stopping server ${id}:`, e.message); }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STATUS & MONITORING
  // ═══════════════════════════════════════════════════════════════════

  async getServerStatus(id) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server) return null;

    const proc = this.runningProcesses.get(id);
    const isRunning = (proc && !proc.killed) ? true : this._isServerRunning(server);

    let playerCount = 0;
    const rconConnId = this.rconConnections.get(id);
    if (rconConnId) {
      try {
        const players = await this.rcon.getPlayers(rconConnId);
        playerCount = players.length;
      } catch (_) {}
    }

    return {
      serverId: id,
      status: isRunning ? 'running' : server.status,
      pid: proc?.pid || null,
      playerCount,
      uptime: proc ? process.uptime() : 0,
      rconConnected: !!rconConnId,
    };
  }

  getConsoleOutput(id) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server || !server.install_path) return 'Server not installed or not found.';

    const logsDir = path.join(server.install_path, 'ShooterGame', 'Saved', 'Logs');
    const mainLog = path.join(logsDir, 'ShooterGame.log');

    if (fs.existsSync(logsDir)) {
      try {
        const files = fs.readdirSync(logsDir)
          .filter(f => f.endsWith('.log'))
          .map(f => path.join(logsDir, f))
          .filter(f => { try { return fs.statSync(f).size > 0; } catch { return false; } })
          .sort((a, b) => {
            // ShooterGame.log zawsze pierwszy (nie backupy)
            if (a === mainLog) return -1;
            if (b === mainLog) return 1;
            return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
          });

        if (files.length > 0) {
          const content = fs.readFileSync(files[0], 'utf8');
          const lines = content.split('\n');
          const output = lines.slice(-300).join('\n');
          if (output.trim()) return output;
        }
      } catch (_) {}
    }

    const isRunning = this._isServerRunning(server);
    if (isRunning) return 'Serwer działa — log jeszcze pusty (ładowanie mapy...). Folder: ' + logsDir;
    return 'Serwer nie działa. Uruchom go najpierw.';
  }

  async sendCommand(id, command) {
    const rconConnId = this.rconConnections.get(id);
    if (!rconConnId) throw new Error('RCON not connected for this server');
    return this.rcon.sendCommand(rconConnId, command);
  }

  /**
   * Daje przedmiot graczowi przez RCON: giveitemtoplayer <playerId> <gfi> <qty> <quality> <forceBP>
   */
  async giveItemToPlayer(serverId, playerRef, gfi, qty, quality = 0, forceBlueprint = false) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) throw new Error(`Server ${serverId} not found`);
    if (!playerRef) throw new Error('Brak ID gracza');
    if (!gfi) throw new Error('Brak przedmiotu');
    const amount = parseInt(qty, 10) || 1;
    const qual = parseInt(quality, 10) || 0;
    const asBP = !!forceBlueprint;

    // ZAWSZE świeże połączenie RCON — cache może trzymać martwy socket po restarcie serwera
    const connId = await this.rcon.connect('127.0.0.1', server.rcon_port, server.admin_password || '');
    try {
      const playerId = this._resolvePlayerDataId(server, playerRef);
      if (!playerId) throw new Error(`Nie znaleziono ARKID dla gracza ${playerRef}. Gracz musi mieć postać na tym serwerze (plik .arkprofile).`);
      const blueprint = this._resolveBlueprint(gfi);
      const result = await this.rcon.giveItem(connId, playerId, blueprint, amount, qual, asBP);
      const desc = `Dano ${gfi} x${amount}${asBP ? ' (blueprint)' : ''}${qual ? ` jakość ${qual}` : ''} graczowi ${playerRef}`;
      this.db.logActivity(serverId, 'give_item', 0, desc);
      return { success: true, message: desc, result };
    } finally {
      this._safeDisconnect(connId);
    }
  }

  /**
   * Zamienia krótką nazwę GFI (np. "Wood") na PEŁNĄ ścieżkę blueprint
   * (Blueprint'/Game/PrimalEarth/CoreBlueprints/...'), bo giveitemtoplayer
   * wymaga pełnej ścieżki, nie krótkiej nazwy.
   */
  _resolveBlueprint(gfi) {
    const s = String(gfi || '').trim();
    if (!s) return s;
    if (s.includes("Blueprint'")) return s; // już pełna ścieżka
    const cls = this._gfiToClass(s);
    if (cls) return this._classToPath(cls);
    return s;
  }

  _gfiToClass(gfi) {
    try {
      const cat = this.configParser && this.configParser.getItemsCatalog ? this.configParser.getItemsCatalog() : [];
      const it = (cat || []).find(i => i.gfi === gfi);
      return it ? it.className : null;
    } catch (_) { return null; }
  }

  _classToPath(className) {
    const c = String(className).replace(/_C$/, '');
    let folder = 'Items';
    if (c.startsWith('PrimalItemResource_')) folder = 'Resources';
    else if (c.startsWith('PrimalItemAmmo_')) folder = 'Items/Ammo';
    else if (c.startsWith('PrimalItemArmor_')) folder = 'Items/Armor';
    else if (/Weapon/.test(c)) folder = 'Weapons';
    else if (c.startsWith('PrimalItemConsumable_')) folder = 'Items/Consumables';
    else if (c.startsWith('PrimalItemStructure_')) folder = 'Items/Structures';
    return `Blueprint'/Game/PrimalEarth/CoreBlueprints/${folder}/${c}.${c}'`;
  }

  /**
   * Zamienia identyfikator gracza na PRAWIDŁOWY PlayerDataID (ARKID), który
   * akceptuje komenda giveitemtoplayer. ListPlayers zwraca indeks ("0. Kruzio"),
   * ale giveitemtoplayer potrzebuje ARKID (np. <ARKID-gracza>), bo indeks "0" nie
   * wskazuje żadnego gracza.
   * - SteamID64 (17 cyfr) → ARKID odczytany z pliku <SavedArks>/<steamId>.arkprofile
   * - Inny identyfikator (np. już ARKID) → przepuszczany bez zmian.
   */
  _resolvePlayerDataId(server, ref) {
    const s = String(ref || '').trim();
    if (!s) return null;
    if (/^\d{16,17}$/.test(s)) {
      const arkId = this._arkIdFromSaveFile(server, s);
      if (arkId) return arkId;
      return null; // nie udało się odczytać ARKID — nie wysyłaj złego ID
    }
    return s;
  }

  /** Odczytuje ARKID (PlayerDataID) z pliku zapisu gracza <steamId>.arkprofile. */
  _arkIdFromSaveFile(server, steamId) {
    const base = String((server && (server.install_path || server.path)) || '').trim();
    const candidates = [];
    if (base) {
      candidates.push(path.join(base, 'ShooterGame', 'Saved', 'SavedArks', `${steamId}.arkprofile`));
      candidates.push(path.join(base, 'ShooterGame', 'Saved', `${steamId}.arkprofile`));
    }
    for (const file of candidates) {
      try {
        if (!fs.existsSync(file)) continue;
        const id = this._extractPlayerDataIdFromArkProfile(file);
        if (id) return id;
      } catch (_) {}
    }
    return null;
  }

  /** Parsuje binarny .arkprofile: "PlayerDataID" → "UInt64Property" → wartość (uint64 LE). */
  _extractPlayerDataIdFromArkProfile(file) {
    try {
      const buf = fs.readFileSync(file);
      const nameIdx = buf.indexOf(Buffer.from('PlayerDataID', 'utf8'));
      if (nameIdx < 0) return null;
      const typeIdx = buf.indexOf(Buffer.from('UInt64Property', 'utf8'), nameIdx);
      if (typeIdx < 0) return null;
      // layout: "UInt64Property\0" (15 B) + size int32 (4 B) + arrayIndex int32 (4 B) + wartość uint64 (8 B)
      const valIdx = typeIdx + 'UInt64Property'.length + 1 + 4 + 4;
      if (valIdx + 8 > buf.length) return null;
      const val = Number(buf.readBigUInt64LE(valIdx));
      if (Number.isSafeInteger(val) && val > 0 && val < 2147483648) return String(val);
      return null;
    } catch (_) {
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ITEM PACKS (Welcome + Event Gifts)
  // ═══════════════════════════════════════════════════════════════════

  /** Zwraca ŚWIEŻE połączenie RCON dla serwera (zawsze nowe — bez martwych socketów z cache). */
  async _ensureRcon(serverId) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) throw new Error(`Server ${serverId} not found`);
    const connId = await this.rcon.connect('127.0.0.1', server.rcon_port, server.admin_password || '');
    return { connId, own: true, server };
  }

  /** Bezpieczne rozłączenie tymczasowego połączenia RCON (disconnect jest sync). */
  _safeDisconnect(connId) {
    try { this.rcon.disconnect(connId); } catch (_) {}
  }

  /** Lista graczy online (playerId, name, steamId) przez RCON. */
  async getOnlinePlayers(serverId) {
    const { connId, own } = await this._ensureRcon(serverId);
    try {
      return await this.rcon.getPlayers(connId);
    } finally {
      if (own) this._safeDisconnect(connId);
    }
  }

  listPacks() {
    const packs = this.db.getPacks();
    return packs.map(p => ({ ...p, items: this._parseItems(p.items_json) }));
  }
  _parseItems(itemsJson) {
    try { return JSON.parse(itemsJson || '[]'); } catch { return []; }
  }

  async savePack(pack) {
    if (!pack || !pack.name) throw new Error('Brak nazwy paczki');
    const saved = this.db.savePack(pack);
    return { ...saved, items: this._parseItems(saved.items_json) };
  }

  deletePack(id) {
    this.db.deletePack(id);
    return { success: true };
  }

  /** Daje paczkę jednemu graczowi (po SteamID lub ARKID). */
  async givePackToPlayer(serverId, packId, playerRef) {
    const pack = this.db.getPack(packId);
    if (!pack) throw new Error(`Pack ${packId} not found`);
    const items = this._parseItems(pack.items_json);
    if (!items.length) throw new Error('Paczka jest pusta');
    const { connId, own, server } = await this._ensureRcon(serverId);
    const playerId = this._resolvePlayerDataId(server, playerRef);
    if (!playerId) throw new Error(`Nie znaleziono ARKID dla gracza ${playerRef}. Gracz musi mieć postać na tym serwerze.`);
    const given = [];
    try {
      for (const it of items) {
        const qty = parseInt(it.qty, 10) || 1;
        await this.rcon.giveItem(connId, playerId, this._resolveBlueprint(it.gfi), qty, 0, false);
        given.push(`${it.gfi} x${qty}`);
      }
    } finally {
      if (own) this._safeDisconnect(connId);
    }
    this.db.logActivity(serverId, 'give_pack', 0, `Paczka "${pack.name}" dla gracza ${playerId}: ${given.join(', ')}`);
    return { success: true, message: `Paczka "${pack.name}" wysłana (${given.length} przedmiotów)`, given };
  }

  /** Daje paczkę wszystkim graczom online. */
  async givePackToAllOnline(serverId, packId) {
    const pack = this.db.getPack(packId);
    if (!pack) throw new Error(`Pack ${packId} not found`);
    const items = this._parseItems(pack.items_json);
    if (!items.length) throw new Error('Paczka jest pusta');
    const { connId, own, server } = await this._ensureRcon(serverId);
    let players = [];
    let givenCount = 0;
    try {
      players = await this.rcon.getPlayers(connId);
      for (const p of players) {
        const playerId = this._resolvePlayerDataId(server, p.steamId || p.playerId);
        if (!playerId) continue;
        for (const it of items) {
          const qty = parseInt(it.qty, 10) || 1;
          await this.rcon.giveItem(connId, playerId, this._resolveBlueprint(it.gfi), qty, 0, false);
        }
        givenCount++;
      }
    } finally {
      if (own) this._safeDisconnect(connId);
    }
    this.db.logActivity(serverId, 'give_pack', players.length, `Paczka "${pack.name}" dla ${players.length} graczy online`);
    return { success: true, message: `Paczka "${pack.name}" wysłana do ${players.length} graczy`, count: players.length };
  }

  /** Opóźnienie welcome (minuty). 0 = natychmiast po wykryciu. */
  getWelcomeDelay() {
    return parseInt(this.db.getSetting('welcome_delay_minutes') || '0', 10) || 0;
  }

  setWelcomeDelay(minutes) {
    const v = parseInt(minutes, 10) || 0;
    this.db.setSetting('welcome_delay_minutes', String(v < 0 ? 0 : v));
    return { success: true, delayMinutes: v < 0 ? 0 : v };
  }

  /** Auto-wykrywa nowych graczy (pierwszy join) i daje im paczki welcome (opcjonalnie z opóźnieniem). */
  async checkWelcomePacks() {
    const welcomePacks = this.db.query("SELECT * FROM item_packs WHERE pack_type = 'welcome' AND enabled = 1");
    if (!welcomePacks.length) return;
    const delayMs = this.getWelcomeDelay() * 60 * 1000;
    const runningServers = this.db.query("SELECT * FROM servers WHERE status = 'running'");
    for (const server of runningServers) {
      if (!server.admin_password) continue;
      let connId = this.rconConnections.get(server.id);
      let own = false;
      if (!connId) {
        try { connId = await this.rcon.connect('127.0.0.1', server.rcon_port, server.admin_password); own = true; }
        catch { continue; }
      }
      try {
        const players = await this.rcon.getPlayers(connId);
        const onlineSteamIds = new Set(players.filter(p => p.steamId).map(p => p.steamId));

        for (const p of players) {
          if (!p.steamId || this.db.isWelcomed(server.id, p.steamId)) continue;

          const pending = this.db.getPendingWelcome(server.id, p.steamId);
          if (!pending) {
            // Pierwszy raz widzimy gracza — zapisz czas wejścia i (przy delay>0) poczekaj
            this.db.addPendingWelcome(server.id, p.steamId);
            if (delayMs > 0) continue;
          } else if (delayMs > 0) {
            // Sprawdź, czy minęło już opóźnienie
            const firstSeen = new Date(pending.first_seen_at.replace(' ', 'T')).getTime();
            if (Number.isFinite(firstSeen) && Date.now() - firstSeen < delayMs) continue;
          }

          // Rozwiąż ARKID gracza; jeśli plik .arkprofile jeszcze nie istnieje (świeża postać) — spróbuj za chwilę
          const playerId = this._resolvePlayerDataId(server, p.steamId);
          if (!playerId) continue;

          // Daj paczki welcome teraz
          for (const pack of welcomePacks) {
            const items = this._parseItems(pack.items_json);
            for (const it of items) {
              const qty = parseInt(it.qty, 10) || 1;
              try { await this.rcon.giveItem(connId, playerId, this._resolveBlueprint(it.gfi), qty, 0, false); } catch {}
            }
          }
          this.db.markWelcomed(server.id, p.steamId);
          this.db.deletePendingWelcome(server.id, p.steamId);
          this.db.logActivity(server.id, 'welcome_pack', 0, `Welcome pack dla gracza ${p.name} (${p.steamId})`);
          console.log(`[ServerManager] Welcome pack dla ${p.name} na "${server.name}"`);
        }

        // Gracz w kolejce, który wyszedł z serwera → zresetuj licznik (dostanie przy następnym wejściu)
        for (const pend of this.db.getPendingWelcomes(server.id)) {
          if (!onlineSteamIds.has(pend.steam_id)) this.db.deletePendingWelcome(server.id, pend.steam_id);
        }
      } catch (_) {
      } finally {
        if (own) this._safeDisconnect(connId);
      }
    }
  }

  /**
   * Dodaje/usuwa gracza jako admina serwera (ServerAdmins w GameUserSettings.ini [ServerSettings]).
   * Wymaga restartu serwera, żeby zadziałało.
   */
  async setServerAdmin(id, steamId, isAdmin) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server) throw new Error(`Server ${id} not found`);
    if (!server.install_path) throw new Error('Serwer nie ma ścieżki instalacji');
    if (!steamId) throw new Error('SteamID jest wymagany');

    const configDir = path.join(server.install_path, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
    const gusPath = path.join(configDir, 'GameUserSettings.ini');
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

    let content = '';
    if (fs.existsSync(gusPath)) content = fs.readFileSync(gusPath, 'utf8');

    const targetLine = `ServerAdmins=${steamId}`;
    let lines = content.split(/\r?\n/);

    if (isAdmin) {
      lines = lines.filter(l => l.trim() !== targetLine);
      const idx = lines.findIndex(l => l.trim() === '[ServerSettings]');
      if (idx >= 0) {
        lines.splice(idx + 1, 0, targetLine);
      } else {
        lines = lines.filter(l => l.trim() !== '');
        lines.push('[ServerSettings]', targetLine);
      }
    } else {
      lines = lines.filter(l => l.trim() !== targetLine);
    }

    fs.writeFileSync(gusPath, lines.join('\r\n'));

    // AllowedCheaterSteamIDs.txt — alternatywna/legacy lista adminów (SteamID po 1 w linii)
    const savedDir = path.join(server.install_path, 'ShooterGame', 'Saved');
    const allowedPath = path.join(savedDir, 'AllowedCheaterSteamIDs.txt');
    let allowedIds = [];
    if (fs.existsSync(allowedPath)) {
      allowedIds = fs.readFileSync(allowedPath, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    }
    if (isAdmin) {
      if (!allowedIds.includes(steamId)) allowedIds.push(steamId);
    } else {
      allowedIds = allowedIds.filter(x => x !== steamId);
    }
    fs.writeFileSync(allowedPath, allowedIds.length ? allowedIds.join('\r\n') + '\r\n' : '');

    this.db.logActivity(id, isAdmin ? 'admin_added' : 'admin_removed', 0, `Admin ${steamId} ${isAdmin ? 'dodany' : 'usunięty'} (ServerAdmins + AllowedCheaterSteamIDs.txt)`);
    return { success: true, message: `Admin ${steamId} ${isAdmin ? 'dodany' : 'usunięty'}. Zrestartuj serwer, aby zastosować.` };
  }

  /**
   * Zwraca obiekt { ase, asa } — czy dany TYP serwera działa (tasklist).
   * Proste i niezawodne (bez escapowania PowerShell).
   */
  _getRunningServerTypes() {
    try {
      const { execSync } = require('child_process');
      const r1 = execSync('tasklist /FI "IMAGENAME eq ShooterGameServer.exe" /NH', { timeout: 5000, encoding: 'utf8', windowsHide: true });
      const r2 = execSync('tasklist /FI "IMAGENAME eq ArkAscendedServer.exe" /NH', { timeout: 5000, encoding: 'utf8', windowsHide: true });
      return { ase: r1.includes('ShooterGameServer.exe'), asa: r2.includes('ArkAscendedServer.exe') };
    } catch { return { ase: false, asa: false }; }
  }

  /**
   * Sprawdza czy KONKRETNY serwer (po ścieżce instalacji) faktycznie działa.
   * Niezawodne przy wielu serwerach tego samego typu (ASE x2).
   */
  _isServerRunning(server) {
    if (!server || !server.install_path) {
      const types = this._getRunningServerTypes();
      return server?.game_type === 'ASA' ? types.asa : types.ase;
    }
    try {
      const exeName = server.game_type === 'ASA' ? 'ArkAscendedServer.exe' : 'ShooterGameServer.exe';
      const root = server.install_path.toLowerCase().replace(/[\\/]+$/, '') + '\\';
      const { execSync } = require('child_process');
      const script = `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq '${exeName}' -and $_.ExecutablePath -and $_.ExecutablePath.ToLower().StartsWith('${root}') } | Select-Object -ExpandProperty ProcessId`;
      const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${script}"`, { timeout: 15000, windowsHide: true, encoding: 'utf8' });
      return out.trim().length > 0;
    } catch (_) {
      const types = this._getRunningServerTypes();
      return server.game_type === 'ASA' ? types.asa : types.ase;
    }
  }

  /**
   * Sync live status — sprawdza KAŻDY serwer osobno (po ścieżce instalacji).
   */
  syncLiveStatus() {
    const servers = this.db.query('SELECT * FROM servers');
    let changed = false;
    for (const s of servers) {
      const isRunning = this._isServerRunning(s);
      if (isRunning && s.status !== 'running') {
        this.db.run("UPDATE servers SET status = 'running' WHERE id = ?", [s.id]);
        console.log(`[ServerManager] Live sync: "${s.name}" → running`);
        changed = true;
      } else if (!isRunning && s.status === 'running') {
        this.db.run("UPDATE servers SET status = 'stopped' WHERE id = ?", [s.id]);
        console.log(`[ServerManager] Live sync: "${s.name}" → stopped`);
        changed = true;
      }
    }
    if (changed) this.db.save();
    this._checkInstallsComplete();
  }

  /**
   * Jeśli serwer ma status 'installing'/'updating' ale exe już istnieje
   * (SteamCMD skończył), ustaw status 'stopped'.
   */
  _checkInstallsComplete() {
    const busy = this.db.query("SELECT * FROM servers WHERE status IN ('installing','updating')");
    if (!busy || busy.length === 0) return;
    let changed = false;
    for (const s of busy) {
      const exeName = s.game_type === 'ASA' ? 'ArkAscendedServer.exe' : 'ShooterGameServer.exe';
      const exePath = s.install_path ? path.join(s.install_path, 'ShooterGame', 'Binaries', 'Win64', exeName) : null;
      if (exePath && fs.existsSync(exePath)) {
        this.db.run("UPDATE servers SET status = 'stopped' WHERE id = ?", [s.id]);
        console.log(`[ServerManager] "${s.name}" install/update complete → stopped`);
        changed = true;
      }
    }
    if (changed) this.db.save();
  }

  /**
   * Wykrywa ISTNIEJĄCE serwery ARK na dyskach (np. D:\ root).
   * READ-ONLY: tylko sprawdza obecność exe serwera, NIC nie modyfikuje.
   * Pomija foldery nie-ARK (duneserver, scumserver itp.), bo nie mają exe ARK.
   */
  detectExistingServers(scanRoots) {
    const roots = (scanRoots && scanRoots.length) ? scanRoots : ['D:\\', 'C:\\ARK', 'C:\\ark', 'C:\\Servers'];
    const found = [];
    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      let entries;
      try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (_) { continue; }
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const dir = path.join(root, e.name);
        const aseExe = path.join(dir, 'ShooterGame', 'Binaries', 'Win64', 'ShooterGameServer.exe');
        const asaExe = path.join(dir, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
        let gameType = null;
        if (fs.existsSync(aseExe)) gameType = 'ASE';
        else if (fs.existsSync(asaExe)) gameType = 'ASA';
        if (gameType) {
          found.push({
            name: this._cleanServerName(e.name),
            game_type: gameType,
            install_path: dir,
            map_name: this._detectMapName(dir) || this._guessMapFromName(e.name) || null,
          });
        }
      }
    }
    // Wyklucz serwery już zarejestrowane (po install_path)
    const existing = this.db.query('SELECT install_path FROM servers');
    const existingPaths = new Set(existing.map(s => (s.install_path || '').toLowerCase()));
    return found.filter(s => !existingPaths.has(s.install_path.toLowerCase()));
  }

  /** Ładna nazwa serwera z nazwy folderu */
  _cleanServerName(folderName) {
    const map = {
      'arkevolvedserver': 'ARK Evolved',
      'arkascendedserver': 'ARK Ascended',
      'scumserver': 'SCUM Server',
      'duneserver': 'Dune Server',
      'theisland': 'The Island',
      'scorchedearth': 'Scorched Earth',
      'thecenter': 'The Center',
      'aberration': 'Aberration',
      'extinction': 'Extinction',
      'ragnarok': 'Ragnarok',
    };
    return map[(folderName || '').toLowerCase()] || folderName;
  }

  /** Wykrywa rzeczywistą mapę z folderów zapisu ShooterGame/Saved/<Mapa> */
  _detectMapName(installPath) {
    try {
      const savedDir = path.join(installPath, 'ShooterGame', 'Saved');
      if (fs.existsSync(savedDir)) {
        const maps = ['TheIsland','ScorchedEarth','TheCenter','Aberration','Extinction','Ragnarok','Valguero','Genesis','Genesis2','CrystalIsles','LostIsland','Fjordur','ClubARK','Svartalfheim','Astraeos'];
        const dirs = fs.readdirSync(savedDir, { withFileTypes: true }).filter(x => x.isDirectory());
        for (const d of dirs) {
          const base = d.name.replace(/_WP$/i, '');
          const match = maps.find(m => m.toLowerCase() === base.toLowerCase());
          if (match) return match;
        }
      }
    } catch (_) {}
    // NIE hardkoduj TheIsland — zwróć null, żeby użytkownik wybrał mapę
    return null;
  }

  /** Próbuje zgadnąć mapę z nazwy folderu (np. "ragnarok" → Ragnarok) */
  _guessMapFromName(name) {
    const maps = ['TheIsland','ScorchedEarth','TheCenter','Aberration','Extinction','Ragnarok','Valguero','Genesis','Genesis2','CrystalIsles','LostIsland','Fjordur','ClubARK','Svartalfheim','Astraeos'];
    const norm = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!norm) return null;
    return maps.find(m => norm.includes(m.toLowerCase()) || m.toLowerCase().includes(norm)) || null;
  }

  async importDetectedServers(servers) {
    const results = [];
    for (const s of servers) {
      const created = await this.createServer({
        name: s.name || this._cleanServerName(path.basename(s.install_path || '')),
        game_type: s.game_type,
        map_name: s.map_name || null, // NIE hardkoduj TheIsland
        install_path: s.install_path,
      });
      results.push(created);
    }
    return results;
  }

  // ═══════════════════════════════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════════════════════════════

  _buildLaunchArgs(server, config, isASA) {
    let mapName = server.map_name || 'TheIsland';
    
    // ASA maps need _WP suffix (e.g., TheIsland_WP)
    if (isASA && !mapName.endsWith('_WP') && !mapName.endsWith('_wp')) {
      // Common ASA map names
      const asaMaps = {
        'TheIsland': 'TheIsland_WP',
        'ScorchedEarth': 'ScorchedEarth_WP',
        'Aberration': 'Aberration_WP',
        'Extinction': 'Extinction_WP',
        'TheCenter': 'TheCenter_WP',
        'Ragnarok': 'Ragnarok_WP',
        'Valguero': 'Valguero_WP',
        'CrystalIsles': 'CrystalIsles_WP',
        'Fjordur': 'Fjordur_WP',
        'LostIsland': 'LostIsland_WP',
        'Genesis': 'Genesis_WP',
        'Genesis2': 'Genesis2_WP',
      };
      mapName = asaMaps[mapName] || mapName + '_WP';
    }

    // ARK server format: MapName?listen?Param1=Val1?Param2=Val2... -flags
    // ALL parameters must be attached to the map name as ONE argument with ? separators
    let launchArg = mapName + '?listen';

    // Game params
    if (server.port) launchArg += `?Port=${server.port}`;
    if (server.query_port) launchArg += `?QueryPort=${server.query_port}`;
    if (server.rcon_port) launchArg += `?RCONPort=${server.rcon_port}`;
    // ASE requires explicit RCONEnabled=True (ASA enables it automatically with port)
    if (server.rcon_port && !isASA) launchArg += '?RCONEnabled=True?RCONServerGameLogBuffer=600';
    if (server.max_players) launchArg += `?MaxPlayers=${server.max_players}`;
    if (server.server_password) launchArg += `?ServerPassword=${server.server_password}`;
    if (server.admin_password) launchArg += `?ServerAdminPassword=${server.admin_password}`;

    // Session name
    if (server.name) launchArg += `?SessionName=${server.name.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')}`;

    // Cluster — ASE: ClusterDirOverride w argumencie mapy; ASA: -ClusterIdOverride jako OSOBNA flaga
    if (server.cluster_id && !isASA) {
      launchArg += `?ClusterDirOverride=${server.cluster_id}`;
    }

    // AltSaveDirectoryName (multi-instance / osobny save)
    if (server.alt_save_dir) {
      launchArg += `?AltSaveDirectoryName=${server.alt_save_dir}`;
    }

    // PvE/PvP
    const admin = config.administration || {};
    if (admin.ServerPVE) launchArg += '?ServerPVE=True';

    // ARK map argument must NOT be quoted — exe parses it directly
    const args = [launchArg];

    // ASA cluster id — osobna flaga (nie w argumencie mapy!)
    if (server.cluster_id && isASA) {
      args.push(`-ClusterIdOverride=${server.cluster_id}`);
    }

    // ASA specific
    if (isASA) {
      args.push(`-WinLiveMaxPlayers=${server.max_players || 70}`);
    }

    // Standard flags
    args.push('-server');
    args.push('-log');
    args.push('-servergamelog'); // Enables GameLog file for console panel

    // ASE: auto-download/install/update modów z Steam Workshop (wymaga [ModInstaller] ModIDS w Game.ini)
    try {
      const mods = this.db.query('SELECT mod_id FROM server_mods WHERE server_id = ? AND active = 1', [server.id]);
      if (mods.length > 0) args.push('-automanagedmods');
    } catch (_) {}

    // BattleEye
    if (server.use_battleye === 0) {
      args.push('-NoBattlEye');
    }

    // Custom server args
    if (server.server_args) {
      const customArgs = server.server_args.split(' ').filter(a => a.trim());
      args.push(...customArgs);
    }

    return args;
  }

  async _gracefulShutdown(id) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server) return;

    const msgs = this.db.queryOne('SELECT * FROM server_messages WHERE server_id = ?', [id]) || {};
    const rconConnId = this.rconConnections.get(id);

    if (rconConnId) {
      try {
        const graceMessage = msgs.shutdown_grace_msg1 || 'Server shutdown required. Server will shutdown in {minutes} minutes.';

        // Send 15-minute warning
        await this.rcon.broadcast(rconConnId, graceMessage.replace('{minutes}', '15'));
        await new Promise(r => setTimeout(r, 600000)); // 10 min

        // Send 5-minute warning
        await this.rcon.broadcast(rconConnId, graceMessage.replace('{minutes}', '5'));
        await new Promise(r => setTimeout(r, 240000)); // 4 min

        // Send 1-minute warning
        const msg1 = msgs.shutdown_grace_msg2 || 'Server shutdown required. Server will shutdown in 1 minute.';
        await this.rcon.broadcast(rconConnId, msg1);
        await new Promise(r => setTimeout(r, 50000));

        // Final message + save
        const msg2 = msgs.shutdown_grace_msg3 || 'Server is shutting down now.';
        await this.rcon.broadcast(rconConnId, msg2);
        await this.rcon.saveWorld(rconConnId);
        await new Promise(r => setTimeout(r, 5000));
      } catch (e) {
        console.log('[ServerManager] Graceful shutdown RCON error:', e.message);
      }
    }
  }

  async _updateModsIfNeeded(serverId) {
    const mods = this.db.query(
      'SELECT mod_id FROM server_mods WHERE server_id = ? AND active = 1',
      [serverId]
    );
    if (mods.length === 0) return;

    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (server.game_type === 'ASE') {
      const modIds = mods.map(m => m.mod_id);
      await this.steamcmd.installModsASE(server.install_path, modIds);
    }
    // ASA mods are handled differently (CurseForge)
  }

  _addConsole(id, text) {
    const buffer = this.consoleBuffers.get(id) || [];
    if (!this.consoleBuffers.has(id)) this.consoleBuffers.set(id, buffer);

    const lines = text.split('\n');
    for (const line of lines) {
      if (line.trim()) buffer.push(line);
    }

    // Keep last 2000 lines
    if (buffer.length > 2000) {
      this.consoleBuffers.set(id, buffer.slice(-2000));
    }

    // Forward to renderer
    try {
      const { BrowserWindow } = require('electron');
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('server:console', { serverId: id, text });
      }
    } catch (_) {}
  }
}

module.exports = ServerManager;
