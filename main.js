// Copyright (c) 2026 Kruzio
// Licensed under the PolyForm Noncommercial License 1.0.0.
// Non-commercial use only. Commercial use and selling of this code are prohibited.
// Derivative works must retain this license and link to: https://github.com/kruzio1985/Ark-Admin-Manager
// https://polyformproject.org/licenses/noncommercial/1.0.0/

/**
 * Ark Admin Manager — Electron Main Process
 * 
 * ARCHITEKTURA (sprawdzona w Multi Admin Manager):
 * - Wszystkie backendy ładowane BEZPOŚREDNIO w main.js
 * - IPC handlers dla komunikacji renderer↔main
 * - contextBridge w preload.js → window.api.invoke
 * - index.html: fetch→IPC bridge
 * - initUserData kopiuje data/ → AppData przy pierwszym uruchomieniu
 */

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');
const os = require('os');
const express = require('express');

// ─── Crash Logger ────────────────────────────────────────────────────────────
const LOG_DIR = path.join(app.getPath('appData'), 'ArkAdminManager', 'logs');
let crashLog = [];
function crashLogWrite(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  crashLog.push(line);
  console.log(line);
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, 'startup.log'), line + '\n');
  } catch (_) {}
}

// Write crash log on uncaught errors
process.on('uncaughtException', (err) => {
  crashLogWrite(`UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}`);
});
process.on('unhandledRejection', (reason) => {
  crashLogWrite(`UNHANDLED REJECTION: ${reason}`);
});

crashLogWrite('=== ARK Admin Manager starting ===');
crashLogWrite(`Packaged: ${app.isPackaged}, Dir: ${__dirname}, Resources: ${process.resourcesPath || 'N/A'}`);

// ─── Backend modules (loaded directly) ───────────────────────────────────────
let Database, ServerManager, SteamCMD, RCON, ConfigParser;
let ModManager, ClusterManager, BackupService, Scheduler, DiscordBot, SystemMonitor;
let EmailService, FirewallManager, FirstInstall, UPnP;

let db = null;
let serverManager = null;
let steamcmd = null;
let rcon = null;
let configParser = null;
let modManager = null;
let clusterManager = null;
let backupService = null;
let scheduler = null;
let discordBot = null;
let systemMonitor = null;
let emailService = null;
let firewallManager = null;
let firstInstall = null;
let upnp = null;
let portPresets = null;
let webServer = null;
let webPort = 8090; // 8080 zajmuje Dune Admin Manager

let mainWindow = null;
let devServerProcess = null;

// ─── Paths ───────────────────────────────────────────────────────────────────
const isDev = !app.isPackaged;
const APP_DATA_DIR = path.join(app.getPath('home'), 'AppData', 'Roaming', 'ArkAdminManager');
const DATA_DIR = isDev 
  ? path.join(__dirname, 'data') 
  : path.join(process.resourcesPath, 'data');
const DB_PATH = path.join(APP_DATA_DIR, 'ark_admin.db');
const DEFAULT_STEAMCMD_DIR = 'D:\\steamcmd';
const DEFAULT_SERVERS_DIR = 'D:\\';
let steamcmdDir = DEFAULT_STEAMCMD_DIR;
let serversDir = DEFAULT_SERVERS_DIR;

// ─── initUserData ────────────────────────────────────────────────────────────
function initUserData() {
  // Ensure AppData directories exist
  const dirs = [
    APP_DATA_DIR,
    path.join(APP_DATA_DIR, 'logs'),
    path.join(APP_DATA_DIR, 'backups'),
  ];
  
  for (const d of dirs) {
    try {
      if (!fs.existsSync(d)) {
        fs.mkdirSync(d, { recursive: true });
      }
    } catch (_) {}
  }

  // Copy data/ to AppData if not exists or needs update
  const dbDest = path.join(APP_DATA_DIR, 'ark_admin.db');
  const dbSrc = path.join(DATA_DIR, 'ark_admin.db');
  
  if (!fs.existsSync(dbDest) && fs.existsSync(dbSrc)) {
    fs.copyFileSync(dbSrc, dbDest);
    console.log('[initUserData] Database copied to AppData');
  }

  // Copy gamedata if not exists
  const gamedataSrc = path.join(DATA_DIR, 'gamedata');
  const gamedataDest = path.join(APP_DATA_DIR, 'gamedata');
  if (!fs.existsSync(gamedataDest) && fs.existsSync(gamedataSrc)) {
    copyDirSync(gamedataSrc, gamedataDest);
  }

  // Copy templates if not exists
  const templatesSrc = path.join(DATA_DIR, 'templates');
  const templatesDest = path.join(APP_DATA_DIR, 'templates');
  if (!fs.existsSync(templatesDest) && fs.existsSync(templatesSrc)) {
    copyDirSync(templatesSrc, templatesDest);
  }
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ─── Load backend modules ────────────────────────────────────────────────────
async function initBackend() {
  console.log('[initBackend] Loading modules...');
  const errors = [];

  try {
    // Load sql.js
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();

    // Database
    try {
      Database = require('./src/backend/database.js');
      db = new Database(SQL, DB_PATH);
      await db.init();
      crashLogWrite('Database OK');
    } catch(e) { errors.push('Database: '+e.message); crashLogWrite('Database FAIL: '+e.message); return; }

    // Resolve configurable paths (SteamCMD + Servers) from settings with auto-detection
    try {
      const savedSteamDir = db.getSetting('steamcmd_dir') || '';
      const candidates = [savedSteamDir, DEFAULT_STEAMCMD_DIR, 'D:\\asmdata\\SteamCMD', 'C:\\steamcmd'];
      steamcmdDir = candidates.find(d => d && fs.existsSync(path.join(d, 'steamcmd.exe'))) || savedSteamDir || DEFAULT_STEAMCMD_DIR;
    } catch (_) { steamcmdDir = DEFAULT_STEAMCMD_DIR; }
    try {
      serversDir = db.getSetting('servers_dir') || DEFAULT_SERVERS_DIR;
      if (serversDir && !fs.existsSync(serversDir)) fs.mkdirSync(serversDir, { recursive: true });
    } catch (_) { serversDir = DEFAULT_SERVERS_DIR; }
    crashLogWrite(`Paths: SteamCMD=${steamcmdDir}, Servers=${serversDir}`);

    // Load editable port presets (data/port-presets.json — NIE hardkodowane)
    try {
      const presetsPath = isDev
        ? path.join(__dirname, 'data', 'port-presets.json')
        : path.join(process.resourcesPath, 'data', 'port-presets.json');
      if (fs.existsSync(presetsPath)) {
        portPresets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
        crashLogWrite('Port presets loaded');
      } else {
        crashLogWrite('Port presets file not found: ' + presetsPath);
      }
    } catch (e) { crashLogWrite('Port presets FAIL: ' + e.message); }

    // Config Parser
    try {
      ConfigParser = require('./src/backend/config-parser.js');
      configParser = new ConfigParser(db);
      crashLogWrite('ConfigParser OK');
    } catch(e) { errors.push('ConfigParser: '+e.message); crashLogWrite('ConfigParser FAIL: '+e.message); }

    // SteamCMD
    try {
      SteamCMD = require('./src/backend/steamcmd.js');
      steamcmd = new SteamCMD(steamcmdDir, db);
      crashLogWrite('SteamCMD OK');
    } catch(e) { errors.push('SteamCMD: '+e.message); crashLogWrite('SteamCMD FAIL: '+e.message); }

    // RCON
    try {
      RCON = require('./src/backend/rcon.js');
      rcon = new RCON(db);
      crashLogWrite('RCON OK');
    } catch(e) { errors.push('RCON: '+e.message); crashLogWrite('RCON FAIL: '+e.message); }

    // Server Manager
    try {
      ServerManager = require('./src/backend/server-manager.js');
      serverManager = new ServerManager(db, steamcmd, rcon, configParser, serversDir);
      crashLogWrite('ServerManager OK');
    } catch(e) { errors.push('ServerManager: '+e.message); crashLogWrite('ServerManager FAIL: '+e.message); }

    // Mod Manager
    try {
      ModManager = require('./src/backend/mod-manager.js');
      modManager = new ModManager(db, steamcmd, serversDir);
      crashLogWrite('ModManager OK');
    } catch(e) { errors.push('ModManager: '+e.message); crashLogWrite('ModManager FAIL: '+e.message); }

    // Cluster Manager
    try {
      ClusterManager = require('./src/backend/cluster-manager.js');
      clusterManager = new ClusterManager(db, configParser, serverManager);
      crashLogWrite('ClusterManager OK');
    } catch(e) { errors.push('ClusterManager: '+e.message); crashLogWrite('ClusterManager FAIL: '+e.message); }

    // Backup Service
    try {
      BackupService = require('./src/backend/backup-service.js');
      backupService = new BackupService(db, APP_DATA_DIR);
      crashLogWrite('BackupService OK');
    } catch(e) { errors.push('BackupService: '+e.message); crashLogWrite('BackupService FAIL: '+e.message); }

    // First-Install Automation
    try {
      FirstInstall = require('./src/backend/first-install.js');
      firstInstall = new FirstInstall(steamcmd, db);
      crashLogWrite('FirstInstall OK');
    } catch(e) { errors.push('FirstInstall: '+e.message); crashLogWrite('FirstInstall FAIL: '+e.message); }

    // UPnP Port Forwarding
    try {
      UPnP = require('./src/backend/upnp.js');
      upnp = new UPnP();
      crashLogWrite('UPnP OK');
    } catch(e) { errors.push('UPnP: '+e.message); crashLogWrite('UPnP FAIL: '+e.message); }

    // Scheduler
    try {
      Scheduler = require('./src/backend/scheduler.js');
      scheduler = new Scheduler(db, serverManager, backupService, rcon);
      crashLogWrite('Scheduler OK');
    } catch(e) { errors.push('Scheduler: '+e.message); crashLogWrite('Scheduler FAIL: '+e.message); }

    // Discord Bot
    try {
      DiscordBot = require('./src/backend/discord-bot.js');
      discordBot = new DiscordBot(db, serverManager, rcon);
      crashLogWrite('DiscordBot OK');
    } catch(e) { errors.push('DiscordBot: '+e.message); crashLogWrite('DiscordBot FAIL: '+e.message); }

    // System Monitor
    try {
      SystemMonitor = require('./src/backend/system-monitor.js');
      systemMonitor = new SystemMonitor();
      crashLogWrite('SystemMonitor OK');
    } catch(e) { errors.push('SystemMonitor: '+e.message); crashLogWrite('SystemMonitor FAIL: '+e.message); }

    // Email Service
    try {
      EmailService = require('./src/backend/email-service.js');
      emailService = new EmailService(db);
      crashLogWrite('EmailService OK');
    } catch(e) { errors.push('EmailService: '+e.message); crashLogWrite('EmailService FAIL: '+e.message); }

    // Firewall Manager
    try {
      FirewallManager = require('./src/backend/firewall-manager.js');
      firewallManager = new FirewallManager(db);
      crashLogWrite('FirewallManager OK');
    } catch(e) { errors.push('FirewallManager: '+e.message); crashLogWrite('FirewallManager FAIL: '+e.message); }

    crashLogWrite(`Backend init done. Errors: ${errors.length}${errors.length ? ': '+errors.join('; ') : ''}`);
  } catch (e) {
    crashLogWrite(`FATAL: ${e.message}\n${e.stack}`);
    console.error('[initBackend] FATAL ERROR:', e.message);
  }
}

// ─── Register IPC Handlers ──────────────────────────────────────────────────
function registerIPC() {
  console.log('[IPC] Registering handlers...');

  // ── App & Window ──
  ipcMain.handle('app:getInfo', () => ({
    version: app.getVersion(),
    name: app.getName(),
    dataDir: APP_DATA_DIR,
    isDev,
    platform: os.platform(),
    hostname: os.hostname(),
  }));

  ipcMain.handle('app:minimize', () => mainWindow?.minimize());
  ipcMain.handle('app:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.handle('app:close', () => mainWindow?.close());
  ipcMain.handle('app:isMaximized', () => mainWindow?.isMaximized() || false);

  // ── Servers ──
  ipcMain.handle('servers:list', async () => serverManager.listServers());
  ipcMain.handle('servers:get', async (_, id) => serverManager.getServer(id));
  ipcMain.handle('servers:create', async (_, data) => serverManager.createServer(data));
  ipcMain.handle('servers:update', async (_, id, data) => serverManager.updateServer(id, data));
  ipcMain.handle('servers:delete', async (_, id) => serverManager.deleteServer(id));
  ipcMain.handle('servers:start', async (_, id) => serverManager.startServer(id));
  ipcMain.handle('servers:stop', async (_, id) => serverManager.stopServer(id));
  ipcMain.handle('servers:restart', async (_, id) => serverManager.restartServer(id));
  ipcMain.handle('servers:install', async (_, id) => serverManager.installServer(id));
  ipcMain.handle('servers:updateFiles', async (_, id) => {
    // Backup przed update (pre-update) — nie blokuje, jeśli się nie uda
    try { await backupService.createBackup(id, { type: 'pre_update' }); } catch (e) { console.error('[PreUpdate] backup fail:', e.message); }
    return serverManager.updateServerFiles(id);
  });
  ipcMain.handle('servers:checkUpdate', async (_, id) => serverManager.checkUpdateForServer(id));
  ipcMain.handle('servers:applyCpu', async (_, id) => serverManager.applyCpuSettings(id));
  ipcMain.handle('servers:tribeLog', async (_, id) => serverManager.getTribeLog(id));
  ipcMain.handle('servers:rollback', async (_, id, manifestId, user, pass) => serverManager.rollbackServer(id, manifestId, user, pass));
  ipcMain.handle('plugins:list', async (_, serverId) => serverManager.listPlugins(serverId));
  ipcMain.handle('plugins:delete', async (_, serverId, fileName) => serverManager.deletePlugin(serverId, fileName));
  ipcMain.handle('asaapi:install', async (_, serverId) => serverManager.installAsaApi(serverId));

  ipcMain.handle('config:snapshotCreate', async (_, serverId, name) => configParser.createSnapshot(serverId, name));
  ipcMain.handle('config:snapshotList', async (_, serverId) => configParser.listSnapshots(serverId));
  ipcMain.handle('config:snapshotRestore', async (_, snapshotId) => configParser.restoreSnapshot(snapshotId));
  ipcMain.handle('config:snapshotDelete', async (_, snapshotId) => configParser.deleteSnapshot(snapshotId));
  ipcMain.handle('config:generate', async (_, serverId) => configParser.generateIni(serverId));
  ipcMain.handle('servers:validate', async (_, id) => serverManager.validateServer(id));
  ipcMain.handle('servers:getStatus', async (_, id) => serverManager.getServerStatus(id));
  ipcMain.handle('servers:getRamUsage', async () => serverManager.getServersResourceUsage());
  ipcMain.handle('servers:getConsole', async (_, id) => serverManager.getConsoleOutput(id));
  ipcMain.handle('servers:setAdmin', async (_, id, steamId, isAdmin) => serverManager.setServerAdmin(id, steamId, isAdmin));
  ipcMain.handle('servers:giveItem', async (_, id, playerId, gfi, qty, quality, forceBlueprint) => serverManager.giveItemToPlayer(id, playerId, gfi, qty, quality, forceBlueprint));

  ipcMain.handle('packs:list', async () => serverManager.listPacks());
  ipcMain.handle('packs:save', async (_, pack) => serverManager.savePack(pack));
  ipcMain.handle('packs:delete', async (_, id) => serverManager.deletePack(id));
  ipcMain.handle('packs:giveToPlayer', async (_, serverId, packId, playerId) => serverManager.givePackToPlayer(serverId, packId, playerId));
  ipcMain.handle('packs:giveToAll', async (_, serverId, packId) => serverManager.givePackToAllOnline(serverId, packId));
  ipcMain.handle('packs:getOnlinePlayers', async (_, serverId) => serverManager.getOnlinePlayers(serverId));
  ipcMain.handle('packs:getWelcomeDelay', async () => serverManager.getWelcomeDelay());
  ipcMain.handle('packs:setWelcomeDelay', async (_, minutes) => serverManager.setWelcomeDelay(minutes));
  ipcMain.handle('servers:detectExisting', async (_, roots) => serverManager.detectExistingServers(roots));
  ipcMain.handle('servers:importDetected', async (_, servers) => serverManager.importDetectedServers(servers));
  ipcMain.handle('servers:getMessages', async (_, id) => db.queryOne('SELECT * FROM server_messages WHERE server_id = ?', [id]));
  ipcMain.handle('servers:saveMessages', async (_, id, msgs) => {
    const fields = ['motd','server_name','welcome_message','shutdown_grace_msg1','shutdown_grace_msg2','shutdown_grace_msg3','world_save_msg','cancel_msg'];
    const sets = []; const values = [];
    for (const f of fields) { if (msgs[f] !== undefined) { sets.push(`${f} = ?`); values.push(msgs[f]); } }
    if (sets.length) { sets.push("updated_at = datetime('now','localtime')"); db.run(`UPDATE server_messages SET ${sets.join(', ')} WHERE server_id = ?`, [...values, id]); db.save(); }
    return db.queryOne('SELECT * FROM server_messages WHERE server_id = ?', [id]);
  });

  // ── Config ──
  ipcMain.handle('config:get', async (_, serverId) => configParser.getConfig(serverId));
  ipcMain.handle('config:save', async (_, serverId, config) => configParser.saveConfig(serverId, config));
  ipcMain.handle('config:getDefaults', async (_, gameType) => configParser.getDefaults(gameType));
  ipcMain.handle('config:merge', async (_, serverId, section, values) => configParser.mergeConfig(serverId, section, values));
  ipcMain.handle('config:validate', async (_, serverId) => configParser.validateConfig(serverId));
  ipcMain.handle('config:export', async (_, serverId) => configParser.exportConfig(serverId));
  ipcMain.handle('config:import', async (_, serverId, data) => configParser.importConfig(serverId, data));
  ipcMain.handle('config:saveAll', async (_, serverId, allChanges) => {
    // Save ALL changed sections in one transaction, then write INI files
    const current = await configParser.getConfig(serverId);
    for (const [section, values] of Object.entries(allChanges)) {
      if (!current[section]) current[section] = {};
      configParser._deepMerge(current[section], values);
    }
    return await configParser.saveConfig(serverId, current);
  });
  ipcMain.handle('config:pushToServer', async (_, serverId) => {
    // Force-write ALL config sections to the server's INI files
    const server = db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) throw new Error(`Server ${serverId} not found`);
    if (!server.install_path) throw new Error(`Server "${server.name}" has no install path — install the server first`);
    const config = await configParser.getConfig(serverId);
    await configParser._writeIniFiles(server, config);
    return { success: true, message: `Config pushed to ${server.name} (Game.ini + GameUserSettings.ini)` };
  });

  // ── RCON ──
  ipcMain.handle('rcon:connect', async (_, host, port, password) => rcon.connect(host, port, password));
  ipcMain.handle('rcon:disconnect', async (_, connId) => rcon.disconnect(connId));
  ipcMain.handle('rcon:send', async (_, connId, cmd) => rcon.sendCommand(connId, cmd));
  ipcMain.handle('rcon:getPlayers', async (_, connId) => rcon.getPlayers(connId));
  ipcMain.handle('rcon:broadcast', async (_, connId, msg) => rcon.broadcast(connId, msg));
  ipcMain.handle('rcon:saveWorld', async (_, connId) => rcon.saveWorld(connId));
  ipcMain.handle('rcon:getServerInfo', async (_, connId) => rcon.getServerInfo(connId));

  // ── Mods ──
  ipcMain.handle('mods:list', async (_, serverId) => modManager.listMods(serverId));
  ipcMain.handle('mods:search', async (_, query, gameType) => modManager.searchMods(query, gameType));
  ipcMain.handle('mods:install', async (_, serverId, modId) => modManager.installMod(serverId, modId));
  ipcMain.handle('mods:remove', async (_, serverId, modId) => modManager.removeMod(serverId, modId));
  ipcMain.handle('mods:update', async (_, serverId, modId) => modManager.updateMod(serverId, modId));
  ipcMain.handle('mods:updateAll', async (_, serverId) => modManager.updateAllMods(serverId));
  ipcMain.handle('mods:getDetails', async (_, modId, gameType) => modManager.getModDetails(modId, gameType));
  ipcMain.handle('mods:getActiveModIds', async (_, serverId) => modManager.getActiveModIds(serverId));

  // ── Clusters ──
  ipcMain.handle('clusters:list', async () => clusterManager.listClusters());
  ipcMain.handle('clusters:get', async (_, id) => clusterManager.getCluster(id));
  ipcMain.handle('clusters:create', async (_, data) => clusterManager.createCluster(data));
  ipcMain.handle('clusters:update', async (_, id, data) => clusterManager.updateCluster(id, data));
  ipcMain.handle('clusters:delete', async (_, id) => clusterManager.deleteCluster(id));
  ipcMain.handle('clusters:addServer', async (_, clusterId, serverId) => clusterManager.addServer(clusterId, serverId));
  ipcMain.handle('clusters:removeServer', async (_, clusterId, serverId) => clusterManager.removeServer(clusterId, serverId));
  ipcMain.handle('clusters:getServers', async (_, clusterId) => clusterManager.getClusterServers(clusterId));
  ipcMain.handle('clusters:syncConfig', async (_, clusterId) => clusterManager.syncClusterConfig(clusterId));
  ipcMain.handle('clusters:validate', async (_, clusterId) => clusterManager.validateCluster(clusterId));
  ipcMain.handle('clusters:action', async (_, clusterId, action) => clusterManager.clusterAction(clusterId, action));
  ipcMain.handle('clusters:applyConfig', async (_, clusterId, section, values) => clusterManager.applyConfigToCluster(clusterId, section, values));
  ipcMain.handle('clusters:applyMods', async (_, clusterId, modIds) => clusterManager.applyModsToCluster(clusterId, modIds));
  ipcMain.handle('clusters:syncMods', async (_, clusterId) => clusterManager.syncModsAcrossCluster(clusterId));
  ipcMain.handle('clusters:backupFolder', async (_, clusterId) => clusterManager.backupClusterFolder(clusterId));
  ipcMain.handle('clusters:listData', async (_, clusterId) => clusterManager.listClusterData(clusterId));
  ipcMain.handle('clusters:transferData', async (_, clusterId, fileName, targetServerId) => clusterManager.transferClusterData(clusterId, fileName, targetServerId));
  ipcMain.handle('clusters:diagnose', async (_, clusterId) => clusterManager.diagnoseCluster(clusterId));
  ipcMain.handle('clusters:baselineCreate', async (_, clusterId, name) => clusterManager.createBaseline(clusterId, name));
  ipcMain.handle('clusters:baselineList', async (_, clusterId) => clusterManager.listBaselines(clusterId));
  ipcMain.handle('clusters:baselineRestore', async (_, baselineId) => clusterManager.restoreBaseline(baselineId));
  ipcMain.handle('clusters:baselineDelete', async (_, baselineId) => clusterManager.deleteBaseline(baselineId));

  // ── Backups ──
  ipcMain.handle('backups:list', async (_, serverId) => backupService.listBackups(serverId));
  ipcMain.handle('backups:create', async (_, serverId, options) => backupService.createBackup(serverId, options));
  ipcMain.handle('backups:restore', async (_, backupId) => backupService.restoreBackup(backupId));
  ipcMain.handle('backups:delete', async (_, backupId) => backupService.deleteBackup(backupId));
  ipcMain.handle('backups:getConfig', async () => backupService.getBackupConfig());
  ipcMain.handle('backups:saveConfig', async (_, config) => backupService.saveBackupConfig(config));
  ipcMain.handle('backups:rotate', async () => backupService.runRotation());
  ipcMain.handle('backups:ftpUpload', async (_, backupId, cfg) => backupService.ftpUpload(backupId, cfg));
  ipcMain.handle('firstinstall:check', async () => firstInstall.check());
  ipcMain.handle('firstinstall:install', async (_, id) => firstInstall.install(id));
  ipcMain.handle('upnp:forward', async (_, serverId) => {
    const server = db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) throw new Error(`Server ${serverId} not found`);
    return upnp.forwardServerPorts(server);
  });
  ipcMain.handle('upnp:remove', async (_, serverId) => {
    const server = db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) throw new Error(`Server ${serverId} not found`);
    const results = [];
    for (const [port, protocol] of [[server.port, 'UDP'], [server.query_port, 'UDP'], [server.rcon_port, 'TCP']]) {
      if (!port) continue;
      try { results.push(await upnp.removePort(port, protocol)); } catch (e) { results.push({ success: false, port, protocol, error: e.message }); }
    }
    return results;
  });

  // ── Scheduler ──
  ipcMain.handle('scheduler:list', async () => scheduler.listTasks());
  ipcMain.handle('scheduler:create', async (_, task) => scheduler.createTask(task));
  ipcMain.handle('scheduler:update', async (_, id, task) => scheduler.updateTask(id, task));
  ipcMain.handle('scheduler:delete', async (_, id) => scheduler.deleteTask(id));
  ipcMain.handle('scheduler:enable', async (_, id) => scheduler.enableTask(id));
  ipcMain.handle('scheduler:disable', async (_, id) => scheduler.disableTask(id));
  ipcMain.handle('scheduler:runNow', async (_, id) => scheduler.runTaskNow(id));
  ipcMain.handle('scheduler:getLog', async (_, taskId) => scheduler.getTaskLog(taskId));

  // ── Discord ──
  ipcMain.handle('discord:getConfig', async () => discordBot.getConfig());
  ipcMain.handle('discord:saveConfig', async (_, config) => discordBot.saveConfig(config));
  ipcMain.handle('discord:start', async () => discordBot.start());
  ipcMain.handle('discord:stop', async () => discordBot.stop());
  ipcMain.handle('discord:getStatus', async () => discordBot.getStatus());
  ipcMain.handle('discord:getLog', async () => discordBot.getLog());
  ipcMain.handle('discord:getServerChannels', async (_, serverId) => discordBot.getServerChannels(serverId));
  ipcMain.handle('discord:saveServerChannels', async (_, serverId, channels) => discordBot.saveServerChannels(serverId, channels));

  // ── System ──
  ipcMain.handle('system:getInfo', async () => systemMonitor.getSystemInfo());
  ipcMain.handle('system:getCpu', async () => systemMonitor.getCpuUsage());
  ipcMain.handle('system:getMemory', async () => systemMonitor.getMemoryUsage());
  ipcMain.handle('system:getDisk', async () => systemMonitor.getDiskInfo());
  ipcMain.handle('system:getNetwork', async () => systemMonitor.getNetworkInfo());
  ipcMain.handle('system:getHistory', async (_, period) => systemMonitor.getHistory(period));

  // ── Game Data ──
  ipcMain.handle('gamedata:listMaps', async (_, gameType) => configParser.listMaps(gameType));
  ipcMain.handle('gamedata:getPortPresets', async () => portPresets);
  ipcMain.handle('gamedata:getMap', async (_, mapName) => configParser.getMapData(mapName));
  ipcMain.handle('gamedata:getCreatures', async (_, mapName) => configParser.getCreatures(mapName));
  ipcMain.handle('gamedata:getEngrams', async (_, mapName) => configParser.getEngrams(mapName));
  ipcMain.handle('gamedata:getItems', async (_, mapName) => configParser.getItems(mapName));
  ipcMain.handle('gamedata:getItemsCatalog', async () => configParser.getItemsCatalog());
  ipcMain.handle('config:getDescriptions', async () => require('./src/backend/config-descriptions.js'));

  // ── SteamCMD ──
  ipcMain.handle('steamcmd:check', async () => steamcmd.checkInstalled());
  ipcMain.handle('steamcmd:install', async () => steamcmd.installSteamCMD());
  ipcMain.handle('steamcmd:update', async () => steamcmd.updateSteamCMD());

  // ── Dialogs ──
  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('dialog:openFile', async (_, filters) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: filters || [{ name: 'All Files', extensions: ['*'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('shell:openExternal', async (_, url) => {
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  // ── Email ──
  ipcMain.handle('email:getConfig', async () => emailService.getConfig());
  ipcMain.handle('email:saveConfig', async (_, cfg) => emailService.saveConfig(cfg));
  ipcMain.handle('email:test', async (_, to) => emailService.sendNotification('ARK Admin Manager - Test Email', 'This is a test email from ARK Admin Manager.'));

  // ── Firewall ──
  ipcMain.handle('firewall:getConfig', async () => {
    if (!firewallManager) throw new Error('Firewall module not loaded');
    return firewallManager.getConfig();
  });
  ipcMain.handle('firewall:saveConfig', async (_, cfg) => {
    if (!firewallManager) throw new Error('Firewall module not loaded');
    return firewallManager.saveConfig(cfg);
  });
  ipcMain.handle('firewall:addRules', async (_, servers) => {
    if (!firewallManager) throw new Error('Firewall module not loaded — restart the app');
    return firewallManager.addServerRulesBulk(servers);
  });
  ipcMain.handle('firewall:removeRules', async (_, serverName) => {
    if (!firewallManager) throw new Error('Firewall module not loaded');
    return firewallManager.removeServerRules(serverName);
  });
  ipcMain.handle('firewall:listRules', async () => {
    if (!firewallManager) throw new Error('Firewall module not loaded');
    return firewallManager.listArkRules();
  });
  ipcMain.handle('firewall:checkPort', async (_, port, protocol) => {
    if (!firewallManager) throw new Error('Firewall module not loaded');
    return firewallManager.checkPortOpen(port, protocol);
  });
  ipcMain.handle('firewall:getPublicIP', async () => {
    if (!firewallManager) {
      // Fallback: try direct fetch even without module
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
    return firewallManager.getPublicIP();
  });

  // ── Profile Sync ──
  ipcMain.handle('profile:getSyncConfig', async () => db.queryOne('SELECT * FROM profile_sync_config WHERE id = 1'));
  ipcMain.handle('profile:saveSyncConfig', async (_, cfg) => {
    const fields = ['sync_mod_ids', 'sync_cluster_id', 'sync_auto_shutdown', 'sync_custom_levels', 'sync_engrams'];
    const sets = [];
    const values = [];
    for (const f of fields) {
      if (cfg[f] !== undefined) { sets.push(`${f} = ?`); values.push(cfg[f]); }
    }
    if (sets.length) {
      sets.push("updated_at = datetime('now','localtime')");
      db.run(`UPDATE profile_sync_config SET ${sets.join(', ')} WHERE id = 1`, values);
      db.save();
    }
    return db.queryOne('SELECT * FROM profile_sync_config WHERE id = 1');
  });
  ipcMain.handle('profile:syncToServers', async (_, sourceServerId, targetServerIds, syncOptions) => {
    if (clusterManager) {
      return clusterManager.selectiveSyncProfiles(sourceServerId, targetServerIds, syncOptions || {});
    }
    const results = [];
    const sourceConfig = await configParser.exportConfig(sourceServerId);
    for (const targetId of targetServerIds) {
      try {
        await configParser.importConfig(targetId, sourceConfig);
        results.push({ serverId: targetId, success: true });
      } catch (e) {
        results.push({ serverId: targetId, success: false, error: e.message });
      }
    }
    return results;
  });

  // ── Auto-Update Config ──
  ipcMain.handle('autoupdate:getConfig', async () => db.queryOne('SELECT * FROM autoupdate_config WHERE id = 1'));
  ipcMain.handle('autoupdate:saveConfig', async (_, cfg) => {
    const fields = ['enabled', 'update_period_minutes', 'use_smart_copy', 'validate_files',
                    'update_mods', 'force_update_mods', 'force_copy_mods', 'retry_on_fail',
                    'show_update_reason', 'override_startup', 'parallel_update',
                    'sequencial_delay', 'verify_after_update', 'update_reason_prefix',
                    'redirect_output', 'ignore_exit_codes', 'cache_dir', 'task_priority'];
    const sets = [];
    const values = [];
    for (const f of fields) {
      if (cfg[f] !== undefined) { sets.push(`${f} = ?`); values.push(cfg[f]); }
    }
    if (sets.length) {
      sets.push("updated_at = datetime('now','localtime')");
      db.run(`UPDATE autoupdate_config SET ${sets.join(', ')} WHERE id = 1`, values);
      db.save();
    }
    return db.queryOne('SELECT * FROM autoupdate_config WHERE id = 1');
  });

  // ── Server Files ──
  ipcMain.handle('serverfiles:list', async (_, serverId, subPath) => {
    const server = db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server?.install_path) throw new Error('Server not installed');
    const fs = require('fs');
    const path = require('path');
    
    // Show config folder first, fallback to whole server dir
    const configPaths = [
      path.join(server.install_path, 'ShooterGame', 'Saved', 'Config', 'WindowsServer'),
      path.join(server.install_path, 'ShooterGame', 'Saved', 'Config'),
      path.join(server.install_path, 'ShooterGame', 'Saved'),
      server.install_path,
    ];
    
    let basePath = server.install_path;
    for (const cp of configPaths) {
      if (fs.existsSync(cp)) { basePath = cp; break; }
    }
    
    const targetPath = subPath ? path.join(basePath, subPath) : basePath;
    if (!fs.existsSync(targetPath)) {
      // Return at least the root files
      const rootFiles = fs.readdirSync(server.install_path, { withFileTypes: true });
      return rootFiles.map(e => ({
        name: e.name, isDirectory: e.isDirectory(),
        path: e.name,
      }));
    }
    
    try {
      return fs.readdirSync(targetPath, { withFileTypes: true }).map(e => ({
        name: e.name, isDirectory: e.isDirectory(),
        path: path.relative(basePath, path.join(targetPath, e.name)).replace(/\\/g, '/'),
      }));
    } catch (e) {
      return [{ name: `Error: ${e.message}`, isDirectory: false, path: '' }];
    }
  });
  ipcMain.handle('serverfiles:read', async (_, serverId, filePath) => {
    const server = db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server?.install_path) throw new Error('Server not installed');
    const fs = require('fs');
    const path = require('path');
    
    // Try to find the file in multiple possible locations
    const searchPaths = [
      path.join(server.install_path, 'ShooterGame', 'Saved', 'Config', 'WindowsServer', filePath),
      path.join(server.install_path, 'ShooterGame', 'Saved', 'Config', filePath),
      path.join(server.install_path, filePath),
    ];
    
    for (const fullPath of searchPaths) {
      if (fs.existsSync(fullPath)) {
        try {
          return fs.readFileSync(fullPath, 'utf8');
        } catch (_) {
          return `[Binary file - cannot display: ${path.basename(fullPath)}]`;
        }
      }
    }
    
    throw new Error(`File not found: ${filePath}`);
  });
  ipcMain.handle('serverfiles:write', async (_, serverId, filePath, content) => {
    const server = db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server?.install_path) throw new Error('Server not installed');
    const fs = require('fs');
    const path = require('path');

    const fullPath = path.join(server.install_path, 'ShooterGame', 'Saved', 'Config', 'WindowsServer', filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    return true;
  });
  ipcMain.handle('serverfiles:delete', async (_, serverId, filePath) => {
    const server = db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server?.install_path) throw new Error('Server not installed');
    const fs = require('fs');
    const path = require('path');
    const fullPath = path.join(server.install_path, 'ShooterGame', 'Saved', 'Config', 'WindowsServer', filePath);
    if (!fs.existsSync(fullPath)) throw new Error('Nie znaleziono pliku');
    if (fs.statSync(fullPath).isDirectory()) fs.rmSync(fullPath, { recursive: true });
    else fs.unlinkSync(fullPath);
    return true;
  });
  ipcMain.handle('serverfiles:rename', async (_, serverId, oldPath, newPath) => {
    const server = db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server?.install_path) throw new Error('Server not installed');
    const fs = require('fs');
    const path = require('path');
    const base = path.join(server.install_path, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
    fs.renameSync(path.join(base, oldPath), path.join(base, newPath));
    return true;
  });
  ipcMain.handle('serverfiles:mkdir', async (_, serverId, dirPath) => {
    const server = db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server?.install_path) throw new Error('Server not installed');
    const fs = require('fs');
    const path = require('path');
    const fullPath = path.join(server.install_path, 'ShooterGame', 'Saved', 'Config', 'WindowsServer', dirPath);
    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
    return true;
  });

  // ── Settings ──
  ipcMain.handle('settings:get', async (_, key) => db.getSetting(key));
  ipcMain.handle('settings:set', async (_, key, value) => db.setSetting(key, value));
  ipcMain.handle('settings:getAll', async () => db.getAllSettings());
  ipcMain.handle('settings:getPaths', async () => ({ steamcmdDir, serversDir }));
  ipcMain.handle('settings:setPaths', async (_, paths) => {
    if (paths?.steamcmdDir) {
      steamcmdDir = paths.steamcmdDir;
      db.setSetting('steamcmd_dir', steamcmdDir);
      if (steamcmd) { steamcmd.steamDir = steamcmdDir; steamcmd.steamcmdExe = path.join(steamcmdDir, 'steamcmd.exe'); }
    }
    if (paths?.serversDir) {
      serversDir = paths.serversDir;
      db.setSetting('servers_dir', serversDir);
      try { if (!fs.existsSync(serversDir)) fs.mkdirSync(serversDir, { recursive: true }); } catch (_) {}
      if (serverManager) serverManager.serversDir = serversDir;
    }
    return { steamcmdDir, serversDir };
  });
  ipcMain.handle('settings:getWebPort', async () => webPort);
  ipcMain.handle('settings:setWebPort', async (_, p) => {
    const parsed = parseInt(p, 10);
    if (parsed && parsed >= 80 && parsed <= 65535) { webPort = parsed; db.setSetting('web_port', String(parsed)); }
    return webPort;
  });
  ipcMain.handle('autostart:get', async () => getAutostart());
  ipcMain.handle('autostart:set', async (_, enabled) => setAutostart(enabled));
  ipcMain.handle('network:getLanIp', async () => {
    const nets = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
      }
    }
    return ips;
  });

  console.log(`[IPC] Registered handlers`);
}

// ─── Autostart (Windows Run registry) ───────────────────────────────────────
const AUTOSTART_REG = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const AUTOSTART_NAME = 'ARK Admin Manager';

function getAutostart() {
  try {
    const { execSync } = require('child_process');
    const out = execSync(`reg query "${AUTOSTART_REG}" /v "${AUTOSTART_NAME}"`, { encoding: 'utf8', windowsHide: true });
    return /ARK Admin Manager/i.test(out);
  } catch (_) { return false; }
}

function setAutostart(enabled) {
  const { execSync } = require('child_process');
  const exe = process.execPath;
  if (enabled) {
    execSync(`reg add "${AUTOSTART_REG}" /v "${AUTOSTART_NAME}" /t REG_SZ /d "\\"${exe}\\"" /f`, { windowsHide: true });
  } else {
    try { execSync(`reg delete "${AUTOSTART_REG}" /v "${AUTOSTART_NAME}" /f`, { windowsHide: true }); } catch (_) {}
  }
  return enabled;
}

// ─── Remote access (Web UI przez IP:port) ───────────────────────────────────
// Działa TAKŻE w trybie spakowanym — serwuje src/ui + REST /api/invoke.
function startWebServer() {
  try {
    const savedPort = parseInt(db.getSetting('web_port') || '', 10);
    if (savedPort && savedPort >= 80 && savedPort <= 65535) webPort = savedPort;
  } catch (_) {}

  const webApp = express();
  webApp.use(express.json());
  webApp.use(express.static(path.join(__dirname, 'src', 'ui')));

  webApp.get('/api/health', (req, res) => {
    res.json({ ok: true, app: 'ARK Admin Manager', version: app.getVersion(), webPort });
  });

  webApp.post('/api/invoke', async (req, res) => {
    const { channel, args } = req.body || {};
    try {
      const result = await dispatchChannel(channel, ...(Array.isArray(args) ? args : []));
      res.json({ ok: true, result });
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      const stack = (e && e.stack) ? e.stack : '';
      crashLogWrite(`dispatch ${channel} ERROR: ${msg}`);
      crashLogWrite(`dispatch ${channel} STACK: ${stack.split('\n').slice(0, 8).join(' | ')}`);
      crashLogWrite(`dispatch ${channel} ARGS: ${JSON.stringify(args).slice(0, 300)}`);
      res.json({ ok: false, error: msg });
    }
  });

  webServer = webApp.listen(webPort, '0.0.0.0', () => {
    crashLogWrite(`Web UI active: http://0.0.0.0:${webPort}`);
  });
  webServer.on('error', (e) => {
    crashLogWrite(`Web server error: ${e.message}`);
    webServer = null;
  });
}

// ─── Dispatcher (używany przez /api/invoke dla dostępu zdalnego) ─────────────
async function dispatchChannel(channel, ...args) {
  switch (channel) {
    // App
    case 'app:getInfo': return { version: app.getVersion(), name: app.getName(), dataDir: APP_DATA_DIR, isDev, platform: os.platform(), hostname: os.hostname(), webPort };
    // Autostart
    case 'autostart:get': return getAutostart();
    case 'autostart:set': return setAutostart(args[0]);
    // Servers
    case 'servers:list': return serverManager.listServers();
    case 'servers:get': return serverManager.getServer(args[0]);
    case 'servers:create': return serverManager.createServer(args[0]);
    case 'servers:update': return serverManager.updateServer(args[0], args[1]);
    case 'servers:delete': return serverManager.deleteServer(args[0]);
    case 'servers:start': return serverManager.startServer(args[0]);
    case 'servers:stop': return serverManager.stopServer(args[0]);
    case 'servers:restart': return serverManager.restartServer(args[0]);
    case 'servers:install': return serverManager.installServer(args[0]);
    case 'servers:updateFiles': return (async () => {
      try { await backupService.createBackup(args[0], { type: 'pre_update' }); } catch (e) { console.error('[PreUpdate] backup fail:', e.message); }
      return serverManager.updateServerFiles(args[0]);
    })();
    case 'servers:checkUpdate': return serverManager.checkUpdateForServer(args[0]);
    case 'servers:applyCpu': return serverManager.applyCpuSettings(args[0]);
    case 'servers:tribeLog': return serverManager.getTribeLog(args[0]);
    case 'servers:rollback': return serverManager.rollbackServer(args[0], args[1], args[2], args[3]);
    case 'plugins:list': return serverManager.listPlugins(args[0]);
    case 'plugins:delete': return serverManager.deletePlugin(args[0], args[1]);
    case 'asaapi:install': return serverManager.installAsaApi(args[0]);
    case 'config:snapshotCreate': return configParser.createSnapshot(args[0], args[1]);
    case 'config:snapshotList': return configParser.listSnapshots(args[0]);
    case 'config:snapshotRestore': return configParser.restoreSnapshot(args[0]);
    case 'config:snapshotDelete': return configParser.deleteSnapshot(args[0]);
    case 'config:generate': return configParser.generateIni(args[0]);
    case 'servers:validate': return serverManager.validateServer(args[0]);
    case 'servers:getStatus': return serverManager.getServerStatus(args[0]);
    case 'servers:getRamUsage': return serverManager.getServersResourceUsage();
    case 'servers:getConsole': return serverManager.getConsoleOutput(args[0]);
    case 'servers:setAdmin': return serverManager.setServerAdmin(args[0], args[1], args[2]);
    case 'servers:giveItem': return serverManager.giveItemToPlayer(args[0], args[1], args[2], args[3], args[4], args[5]);
    case 'packs:list': return serverManager.listPacks();
    case 'packs:save': return serverManager.savePack(args[0]);
    case 'packs:delete': return serverManager.deletePack(args[0]);
    case 'packs:giveToPlayer': return serverManager.givePackToPlayer(args[0], args[1], args[2]);
    case 'packs:giveToAll': return serverManager.givePackToAllOnline(args[0], args[1]);
    case 'packs:getOnlinePlayers': return serverManager.getOnlinePlayers(args[0]);
    case 'packs:getWelcomeDelay': return serverManager.getWelcomeDelay();
    case 'packs:setWelcomeDelay': return serverManager.setWelcomeDelay(args[0]);
    case 'servers:detectExisting': return serverManager.detectExistingServers(args[0]);
    case 'servers:importDetected': return serverManager.importDetectedServers(args[0]);
    // Config
    case 'config:get': return configParser.getConfig(args[0]);
    case 'config:save': return configParser.saveConfig(args[0], args[1]);
    case 'config:getDefaults': return configParser.getDefaults(args[0]);
    case 'config:merge': return configParser.mergeConfig(args[0], args[1], args[2]);
    case 'config:validate': return configParser.validateConfig(args[0]);
    case 'config:export': return configParser.exportConfig(args[0]);
    case 'config:import': return configParser.importConfig(args[0], args[1]);
    case 'config:saveAll': {
      const current = await configParser.getConfig(args[0]);
      for (const [section, values] of Object.entries(args[1] || {})) {
        if (!current[section]) current[section] = {};
        configParser._deepMerge(current[section], values);
      }
      return configParser.saveConfig(args[0], current);
    }
    case 'config:pushToServer': {
      const server = db.queryOne('SELECT * FROM servers WHERE id = ?', [args[0]]);
      if (!server) throw new Error('Server not found');
      if (!server.install_path) throw new Error('Server has no install path');
      const cfg = await configParser.getConfig(args[0]);
      await configParser._writeIniFiles(server, cfg);
      return { success: true, message: `Config pushed to ${server.name}` };
    }
    case 'config:getDescriptions': return require('./src/backend/config-descriptions.js');
    // RCON
    case 'rcon:connect': return rcon.connect(args[0], args[1], args[2]);
    case 'rcon:disconnect': return rcon.disconnect(args[0]);
    case 'rcon:send': return rcon.sendCommand(args[0], args[1]);
    case 'rcon:getPlayers': return rcon.getPlayers(args[0]);
    case 'rcon:broadcast': return rcon.broadcast(args[0], args[1]);
    case 'rcon:saveWorld': return rcon.saveWorld(args[0]);
    case 'rcon:getServerInfo': return rcon.getServerInfo(args[0]);
    // Mods
    case 'mods:list': return modManager.listMods(args[0]);
    case 'mods:search': return modManager.searchMods(args[0], args[1]);
    case 'mods:install': return modManager.installMod(args[0], args[1]);
    case 'mods:remove': return modManager.removeMod(args[0], args[1]);
    case 'mods:update': return modManager.updateMod(args[0], args[1]);
    case 'mods:updateAll': return modManager.updateAllMods(args[0]);
    case 'mods:getDetails': return modManager.getModDetails(args[0], args[1]);
    case 'mods:getActiveModIds': return modManager.getActiveModIds(args[0]);
    // Clusters
    case 'clusters:list': return clusterManager.listClusters();
    case 'clusters:get': return clusterManager.getCluster(args[0]);
    case 'clusters:create': return clusterManager.createCluster(args[0]);
    case 'clusters:update': return clusterManager.updateCluster(args[0], args[1]);
    case 'clusters:delete': return clusterManager.deleteCluster(args[0]);
    case 'clusters:addServer': return clusterManager.addServer(args[0], args[1]);
    case 'clusters:removeServer': return clusterManager.removeServer(args[0], args[1]);
    case 'clusters:getServers': return clusterManager.getClusterServers(args[0]);
    case 'clusters:syncConfig': return clusterManager.syncClusterConfig(args[0]);
    case 'clusters:validate': return clusterManager.validateCluster(args[0]);
    case 'clusters:action': return clusterManager.clusterAction(args[0], args[1]);
    case 'clusters:applyConfig': return clusterManager.applyConfigToCluster(args[0], args[1], args[2]);
    case 'clusters:applyMods': return clusterManager.applyModsToCluster(args[0], args[1]);
    case 'clusters:syncMods': return clusterManager.syncModsAcrossCluster(args[0]);
    case 'clusters:backupFolder': return clusterManager.backupClusterFolder(args[0]);
    case 'clusters:listData': return clusterManager.listClusterData(args[0]);
    case 'clusters:transferData': return clusterManager.transferClusterData(args[0], args[1], args[2]);
    case 'clusters:diagnose': return clusterManager.diagnoseCluster(args[0]);
    case 'clusters:baselineCreate': return clusterManager.createBaseline(args[0], args[1]);
    case 'clusters:baselineList': return clusterManager.listBaselines(args[0]);
    case 'clusters:baselineRestore': return clusterManager.restoreBaseline(args[0]);
    case 'clusters:baselineDelete': return clusterManager.deleteBaseline(args[0]);
    // Backups
    case 'backups:list': return backupService.listBackups(args[0]);
    case 'backups:create': return backupService.createBackup(args[0], args[1]);
    case 'backups:restore': return backupService.restoreBackup(args[0]);
    case 'backups:delete': return backupService.deleteBackup(args[0]);
    case 'backups:getConfig': return backupService.getBackupConfig();
    case 'backups:saveConfig': return backupService.saveBackupConfig(args[0]);
    case 'backups:rotate': return backupService.runRotation();
    case 'backups:ftpUpload': return backupService.ftpUpload(args[0], args[1]);
    case 'firstinstall:check': return firstInstall.check();
    case 'firstinstall:install': return firstInstall.install(args[0]);
    case 'upnp:forward': {
      const srv = db.queryOne('SELECT * FROM servers WHERE id = ?', [args[0]]);
      if (!srv) throw new Error(`Server ${args[0]} not found`);
      return upnp.forwardServerPorts(srv);
    }
    case 'upnp:remove': {
      const srv = db.queryOne('SELECT * FROM servers WHERE id = ?', [args[0]]);
      if (!srv) throw new Error(`Server ${args[0]} not found`);
      return (async () => {
        const res = [];
        for (const [port, protocol] of [[srv.port, 'UDP'], [srv.query_port, 'UDP'], [srv.rcon_port, 'TCP']]) {
          if (!port) continue;
          try { res.push(await upnp.removePort(port, protocol)); } catch (e) { res.push({ success: false, port, protocol, error: e.message }); }
        }
        return res;
      })();
    }
    // Scheduler
    case 'scheduler:list': return scheduler.listTasks();
    case 'scheduler:create': return scheduler.createTask(args[0]);
    case 'scheduler:update': return scheduler.updateTask(args[0], args[1]);
    case 'scheduler:delete': return scheduler.deleteTask(args[0]);
    case 'scheduler:enable': return scheduler.enableTask(args[0]);
    case 'scheduler:disable': return scheduler.disableTask(args[0]);
    case 'scheduler:runNow': return scheduler.runTaskNow(args[0]);
    case 'scheduler:getLog': return scheduler.getTaskLog(args[0]);
    // Discord
    case 'discord:getConfig': return discordBot.getConfig();
    case 'discord:saveConfig': return discordBot.saveConfig(args[0]);
    case 'discord:start': return discordBot.start();
    case 'discord:stop': return discordBot.stop();
    case 'discord:getStatus': return discordBot.getStatus();
    case 'discord:getLog': return discordBot.getLog();
    // System
    case 'system:getInfo': return systemMonitor.getSystemInfo();
    case 'system:getCpu': return systemMonitor.getCpuUsage();
    case 'system:getMemory': return systemMonitor.getMemoryUsage();
    case 'system:getDisk': return systemMonitor.getDiskInfo();
    case 'system:getNetwork': return systemMonitor.getNetworkInfo();
    case 'system:getHistory': return systemMonitor.getHistory(args[0]);
    // Game data
    case 'gamedata:listMaps': return configParser.listMaps(args[0]);
    case 'gamedata:getMap': return configParser.getMapData(args[0]);
    case 'gamedata:getCreatures': return configParser.getCreatures(args[0]);
    case 'gamedata:getEngrams': return configParser.getEngrams(args[0]);
    case 'gamedata:getItems': return configParser.getItems(args[0]);
    case 'gamedata:getItemsCatalog': return configParser.getItemsCatalog();
    case 'gamedata:getPortPresets': return portPresets;
    // SteamCMD
    case 'steamcmd:check': return steamcmd.checkInstalled();
    case 'steamcmd:install': return steamcmd.installSteamCMD();
    case 'steamcmd:update': return steamcmd.updateSteamCMD();
    // Settings
    case 'settings:get': return db.getSetting(args[0]);
    case 'settings:set': return db.setSetting(args[0], args[1]);
    case 'settings:getAll': return db.getAllSettings();
    case 'settings:getPaths': return { steamcmdDir, serversDir };
    case 'settings:setPaths': {
      if (args[0]?.steamcmdDir) {
        steamcmdDir = args[0].steamcmdDir;
        db.setSetting('steamcmd_dir', steamcmdDir);
        if (steamcmd) { steamcmd.steamDir = steamcmdDir; steamcmd.steamcmdExe = path.join(steamcmdDir, 'steamcmd.exe'); }
      }
      if (args[0]?.serversDir) {
        serversDir = args[0].serversDir;
        db.setSetting('servers_dir', serversDir);
        try { if (!fs.existsSync(serversDir)) fs.mkdirSync(serversDir, { recursive: true }); } catch (_) {}
        if (serverManager) serverManager.serversDir = serversDir;
      }
      return { steamcmdDir, serversDir };
    }
    case 'settings:getWebPort': return webPort;
    case 'settings:setWebPort': {
      const p = parseInt(args[0], 10);
      if (p && p >= 80 && p <= 65535) { webPort = p; db.setSetting('web_port', String(p)); }
      return webPort;
    }
    case 'network:getLanIp': {
      const nets = os.networkInterfaces();
      const ips = [];
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
        }
      }
      return ips;
    }
    // Email
    case 'email:getConfig': return emailService.getConfig();
    case 'email:saveConfig': return emailService.saveConfig(args[0]);
    // Firewall
    case 'firewall:getConfig': return firewallManager.getConfig();
    case 'firewall:saveConfig': return firewallManager.saveConfig(args[0]);
    case 'firewall:addRules': return firewallManager.addServerRulesBulk(args[0]);
    case 'firewall:removeRules': return firewallManager.removeServerRules(args[0]);
    case 'firewall:listRules': return firewallManager.listArkRules();
    case 'firewall:checkPort': return firewallManager.checkPortOpen(args[0], args[1]);
    case 'firewall:getPublicIP': return firewallManager.getPublicIP();
    default:
      throw new Error(`Channel "${channel}" not available over web access`);
  }
}

// ─── Create Window ──────────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'Plik',
      submenu: [
        { label: 'Odśwież', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.reload() },
        { type: 'separator' },
        { role: 'quit', label: 'Wyjście' },
      ],
    },
    {
      label: 'Widok',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      ],
    },
    {
      label: 'Pomoc',
      submenu: [
        {
          label: 'Instrukcja / Help',
          click: () => { try { mainWindow?.webContents.send('menu:openHelp'); } catch (_) {} },
        },
        { type: 'separator' },
        {
          label: 'O programie',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'ARK Admin Manager',
              message: 'ARK Admin Manager',
              detail: 'Zarządzanie serwerami ARK: Survival Evolved (ASE) i Survival Ascended (ASA).\n\nAutor: Kruzio\nLicencja: MIT',
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'ARK Admin Manager',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    backgroundColor: '#0f1923',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'src', 'ui', 'index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false));

  buildMenu();
}

// ─── App Lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  crashLogWrite('App ready, initializing...');

  try { initUserData(); crashLogWrite('initUserData done'); }
  catch (e) { crashLogWrite(`initUserData ERROR: ${e.message}`); }

  try { await initBackend(); crashLogWrite('initBackend done'); }
  catch (e) { crashLogWrite(`initBackend ERROR: ${e.message}`); }

  try { registerIPC(); crashLogWrite('registerIPC done'); }
  catch (e) { crashLogWrite(`registerIPC ERROR: ${e.message}`); }

  // Start remote access web server (IP:port — domyślnie 8090, bo 8080 zajmuje Dune)
  try { startWebServer(); crashLogWrite('Web server started'); }
  catch (e) { crashLogWrite(`Web server ERROR: ${e.message}`); }

  // Start Discord bot if enabled (safe - won't crash if backend failed)
  try {
    if (discordBot) {
      const discordCfg = await discordBot.getConfig();
      if (discordCfg?.enabled) await discordBot.start();
    }
  } catch (e) { crashLogWrite(`Discord start: ${e.message}`); }

  // Start scheduler (safe)
  try { if (scheduler) await scheduler.start(); }
  catch (e) { crashLogWrite(`Scheduler start: ${e.message}`); }

  // Sync live server status — detect already-running ARK processes
  try { if (serverManager) { serverManager.syncLiveStatus(); crashLogWrite('Live status sync done'); } }
  catch (e) { crashLogWrite(`Live sync: ${e.message}`); }

  crashLogWrite('Creating window...');
  try { createWindow(); crashLogWrite('Window created'); }
  catch (e) { crashLogWrite(`createWindow ERROR: ${e.message}`); }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  // Jeśli działa dostęp zdalny (web server), NIE zamykaj aplikacji —
  // aplikacja pracuje w tle (headless) i serwuje UI przez IP:port.
  if (webServer) {
    crashLogWrite('Window closed — web server keeps running (remote access)');
    return;
  }
  try { await discordBot?.stop(); } catch (_) {}
  try { await scheduler?.stop(); } catch (_) {}
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  try { await discordBot?.stop(); } catch (_) {}
  try { await scheduler?.stop(); } catch (_) {}
  try { await serverManager?.stopAll(); } catch (_) {}
});
