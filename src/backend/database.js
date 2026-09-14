// Copyright (c) 2026 Kruzio
// Licensed under the PolyForm Noncommercial License 1.0.0.
// Non-commercial use only. Commercial use and selling of this code are prohibited.
// https://polyformproject.org/licenses/noncommercial/1.0.0/

/**
 * Ark Admin Manager — Database Module
 * SQLite via sql.js (WASM) — identycznie jak ScumAdminManager i Multi Admin Manager
 */
class Database {
  constructor(SQL, dbPath) {
    this.SQL = SQL;
    this.dbPath = dbPath;
    this.db = null;
  }

  async init() {
    const fs = require('fs');
    const path = require('path');

    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Load or create database
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(buffer);
    } else {
      this.db = new this.SQL.Database();
    }

    // Run migrations
    await this.migrate();
    console.log('[Database] Initialized at', this.dbPath);
  }

  async migrate() {
    this.db.run('PRAGMA journal_mode=WAL');
    this.db.run('PRAGMA foreign_keys=ON');

    const migrations = [
      // ── Servers ──
      `CREATE TABLE IF NOT EXISTS servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        game_type TEXT NOT NULL DEFAULT 'ASE',  -- 'ASE' or 'ASA'
        map_name TEXT NOT NULL DEFAULT 'TheIsland',
        install_path TEXT,
        status TEXT DEFAULT 'stopped',
        port INTEGER DEFAULT 7790,
        query_port INTEGER DEFAULT 27017,
        rcon_port INTEGER DEFAULT 32330,
        max_players INTEGER DEFAULT 70,
        server_password TEXT,
        admin_password TEXT,
        cluster_id TEXT,
        server_args TEXT,
        use_battleye INTEGER DEFAULT 1,
        raw_sockets INTEGER DEFAULT 0,
        auto_start INTEGER DEFAULT 0,
        auto_restart INTEGER DEFAULT 0,
        auto_update INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      )`,

      // ── Server Config (JSON blob per server — all ASM sections) ──
      `CREATE TABLE IF NOT EXISTS server_config (
        server_id INTEGER PRIMARY KEY,
        config_json TEXT DEFAULT '{}',
        game_ini TEXT,
        gameusersettings_ini TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      )`,

      // ── Mods ──
      `CREATE TABLE IF NOT EXISTS server_mods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        mod_id TEXT NOT NULL,
        mod_name TEXT,
        game_type TEXT NOT NULL DEFAULT 'ASE',
        installed INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1,
        version TEXT,
        updated_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
        UNIQUE(server_id, mod_id)
      )`,

      // ── Clusters ──
      `CREATE TABLE IF NOT EXISTS clusters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        cluster_id TEXT UNIQUE NOT NULL,
        game_type TEXT NOT NULL DEFAULT 'ASE',
        created_at TEXT DEFAULT (datetime('now','localtime'))
      )`,

      `CREATE TABLE IF NOT EXISTS cluster_servers (
        cluster_id INTEGER NOT NULL,
        server_id INTEGER NOT NULL,
        added_at TEXT DEFAULT (datetime('now','localtime')),
        PRIMARY KEY (cluster_id, server_id),
        FOREIGN KEY (cluster_id) REFERENCES clusters(id) ON DELETE CASCADE,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      )`,

      // ── Cluster Config Baselines (snapshot + rollback) ──
      `CREATE TABLE IF NOT EXISTS cluster_baselines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cluster_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        snapshots_json TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (cluster_id) REFERENCES clusters(id) ON DELETE CASCADE
      )`,

      // ── Backups ──
      `CREATE TABLE IF NOT EXISTS backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        size_bytes INTEGER,
        type TEXT DEFAULT 'manual',
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      )`,

      // ── Scheduled Tasks (cron-like) ──
      `CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        task_type TEXT NOT NULL,
        server_id INTEGER,
        cron_expression TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        config_json TEXT DEFAULT '{}',
        last_run TEXT,
        next_run TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE SET NULL
      )`,

      `CREATE TABLE IF NOT EXISTS task_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        status TEXT,
        output TEXT,
        duration_ms INTEGER,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE
      )`,

      // ── RCON Connections ──
      `CREATE TABLE IF NOT EXISTS rcon_connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        password TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE SET NULL
      )`,

      // ── Discord Config ──
      `CREATE TABLE IF NOT EXISTS discord_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        enabled INTEGER DEFAULT 0,
        token TEXT,
        client_id TEXT,
        guild_id TEXT,
        prefix TEXT DEFAULT 'ark!',
        channel_status TEXT,
        channel_console TEXT,
        channel_chat TEXT,
        channel_alerts TEXT,
        channel_players TEXT,
        channel_adminlog TEXT,
        allow_backup INTEGER DEFAULT 1,
        allow_update INTEGER DEFAULT 1,
        allow_start INTEGER DEFAULT 1,
        allow_restart INTEGER DEFAULT 1,
        allow_shutdown INTEGER DEFAULT 1,
        allow_stop INTEGER DEFAULT 1,
        log_level INTEGER DEFAULT 3,
        cross_chat_enabled INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      )`,

      // ── Per-Server Discord Channels ──
      `CREATE TABLE IF NOT EXISTS discord_server_channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        channel_console TEXT,
        channel_chat TEXT,
        channel_alerts TEXT,
        channel_players TEXT,
        cross_chat_enabled INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
        UNIQUE(server_id)
      )`,

      // ── System Metrics History ──
      `CREATE TABLE IF NOT EXISTS system_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cpu_percent REAL,
        ram_percent REAL,
        ram_used_gb REAL,
        ram_total_gb REAL,
        disk_percent REAL,
        disk_used_gb REAL,
        disk_total_gb REAL,
        network_up_bps REAL,
        network_down_bps REAL,
        recorded_at TEXT DEFAULT (datetime('now','localtime'))
      )`,

      // ── Server Activity Log ──
      `CREATE TABLE IF NOT EXISTS server_activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        activity_type TEXT NOT NULL,
        player_count INTEGER,
        description TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      )`,

      // ── Backup Config ──
      `CREATE TABLE IF NOT EXISTS backup_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        enabled INTEGER DEFAULT 0,
        period_minutes INTEGER DEFAULT 60,
        parallel_backup INTEGER DEFAULT 1,
        delete_old INTEGER DEFAULT 1,
        delete_days INTEGER DEFAULT 30,
        world_save_message TEXT DEFAULT 'A world save is about to be performed, you may experience some lag.',
        backup_path TEXT,
        include_saved INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      )`,

      // ── Settings (key-value) ──
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      )`,

      // ── Server Messages ──
      `CREATE TABLE IF NOT EXISTS server_messages (
        server_id INTEGER PRIMARY KEY,
        motd TEXT,
        server_name TEXT,
        welcome_message TEXT,
        shutdown_grace_msg1 TEXT DEFAULT 'Server shutdown required. Server will shutdown in {minutes} minutes.',
        shutdown_grace_msg2 TEXT DEFAULT 'Server shutdown required. Server will shutdown in 1 minute.',
        shutdown_grace_msg3 TEXT DEFAULT 'Server shutdown required. Server is shutting down now.',
        world_save_msg TEXT DEFAULT 'Server is about to shutdown, performing a world save.',
        cancel_msg TEXT DEFAULT 'Server shutdown has been cancelled.',
        updated_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      )`,

      // ── Email Config ──
      `CREATE TABLE IF NOT EXISTS email_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        enabled INTEGER DEFAULT 0,
        smtp_host TEXT,
        smtp_port INTEGER DEFAULT 25,
        smtp_use_ssl INTEGER DEFAULT 0,
        smtp_use_default_credentials INTEGER DEFAULT 0,
        smtp_username TEXT,
        smtp_password TEXT,
        email_from TEXT,
        email_to TEXT,
        notify_update INTEGER DEFAULT 0,
        notify_restart INTEGER DEFAULT 0,
        notify_backup INTEGER DEFAULT 0,
        notify_shutdown INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      )`,

      // ── Firewall Config ──
      `CREATE TABLE IF NOT EXISTS firewall_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        manage_automatically INTEGER DEFAULT 0,
        added_rules TEXT DEFAULT '[]',
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      )`,

      // ── Profile Sync Config ──
      `CREATE TABLE IF NOT EXISTS profile_sync_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_mod_ids INTEGER DEFAULT 0,
        sync_cluster_id INTEGER DEFAULT 0,
        sync_auto_shutdown INTEGER DEFAULT 0,
        sync_custom_levels INTEGER DEFAULT 0,
        sync_engrams INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      )`,

      // ── Auto-Update Config ──
      `CREATE TABLE IF NOT EXISTS autoupdate_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        enabled INTEGER DEFAULT 0,
        update_period_minutes INTEGER DEFAULT 60,
        use_smart_copy INTEGER DEFAULT 1,
        validate_files INTEGER DEFAULT 1,
        update_mods INTEGER DEFAULT 1,
        force_update_mods INTEGER DEFAULT 0,
        force_copy_mods INTEGER DEFAULT 0,
        retry_on_fail INTEGER DEFAULT 0,
        show_update_reason INTEGER DEFAULT 1,
        override_startup INTEGER DEFAULT 0,
        parallel_update INTEGER DEFAULT 0,
        sequencial_delay INTEGER DEFAULT 10,
        verify_after_update INTEGER DEFAULT 0,
        update_reason_prefix TEXT DEFAULT 'Server Update Reason:',
        redirect_output INTEGER DEFAULT 0,
        ignore_exit_codes TEXT DEFAULT '',
        cache_dir TEXT,
        task_priority INTEGER DEFAULT 32,
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      )`,

      // ── Item Packs (Welcome / Event Gifts) ──
      `CREATE TABLE IF NOT EXISTS item_packs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        pack_type TEXT NOT NULL DEFAULT 'gift',  -- 'welcome' | 'gift'
        items_json TEXT DEFAULT '[]',            -- [{gfi, name, qty}]
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      )`,

      // ── Players who already received their welcome pack ──
      `CREATE TABLE IF NOT EXISTS welcomed_players (
        server_id INTEGER NOT NULL,
        steam_id TEXT NOT NULL,
        received_at TEXT DEFAULT (datetime('now','localtime')),
        PRIMARY KEY (server_id, steam_id)
      )`,

      // ── Players waiting for delayed welcome pack ──
      `CREATE TABLE IF NOT EXISTS pending_welcome (
        server_id INTEGER NOT NULL,
        steam_id TEXT NOT NULL,
        first_seen_at TEXT DEFAULT (datetime('now','localtime')),
        PRIMARY KEY (server_id, steam_id)
      )`,

      // ── Config snapshots (staging/baseline per server) ──
      `CREATE TABLE IF NOT EXISTS config_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        config_json TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      )`,
    ];

    // Additive columns (safe — ignorowane, jeśli już istnieją)
    const addColumns = [
      'ALTER TABLE servers ADD COLUMN alt_save_dir TEXT',
      'ALTER TABLE servers ADD COLUMN cpu_affinity TEXT',
      "ALTER TABLE servers ADD COLUMN cpu_priority TEXT DEFAULT 'normal'",
    ];
    for (const sql of addColumns) {
      try { this.db.run(sql); } catch (_) {}
    }

    for (const sql of migrations) {
      this.db.run(sql);
    }

    // Insert default data if empty
    const row = this.db.exec('SELECT COUNT(*) as cnt FROM discord_config');
    if (!row.length || !row[0].values.length || row[0].values[0][0] === 0) {
      this.db.run(`INSERT INTO discord_config (id) VALUES (1)`);
    }

    const bcRow = this.db.exec('SELECT COUNT(*) as cnt FROM backup_config');
    if (!bcRow.length || !bcRow[0].values.length || bcRow[0].values[0][0] === 0) {
      this.db.run(`INSERT INTO backup_config (id) VALUES (1)`);
    }

    // Insert default records for new config tables
    for (const tbl of ['email_config', 'firewall_config', 'profile_sync_config', 'autoupdate_config']) {
      const r = this.db.exec(`SELECT COUNT(*) as cnt FROM ${tbl}`);
      if (!r.length || !r[0].values.length || r[0].values[0][0] === 0) {
        this.db.run(`INSERT INTO ${tbl} (id) VALUES (1)`);
      }
    }

    this.save();
  }

  // ── Generic DB methods ──
  run(sql, params = []) {
    this.db.run(sql, params);
  }

  query(sql, params = []) {
    const stmt = this.db.prepare(sql);
    if (params.length) stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  queryOne(sql, params = []) {
    const results = this.query(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  save() {
    const fs = require('fs');
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  // ── Settings ──
  getSetting(key) {
    const row = this.queryOne('SELECT value FROM settings WHERE key = ?', [key]);
    return row ? row.value : null;
  }

  setSetting(key, value) {
    this.db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime(\'now\',\'localtime\')',
      [key, value, value]
    );
    this.save();
  }

  getAllSettings() {
    const rows = this.query('SELECT key, value FROM settings');
    const result = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  }

  // ── Activity Logging ──
  logActivity(serverId, type, playerCount = 0, description = '') {
    this.db.run(
      'INSERT INTO server_activity_log (server_id, activity_type, player_count, description) VALUES (?, ?, ?, ?)',
      [serverId, type, playerCount, description]
    );
    this.save();
  }

  getActivityLog(serverId, limit = 100) {
    return this.query(
      'SELECT * FROM server_activity_log WHERE server_id = ? ORDER BY created_at DESC LIMIT ?',
      [serverId, limit]
    );
  }

  // ── Item Packs ──
  getPacks() {
    return this.query('SELECT * FROM item_packs ORDER BY pack_type, name');
  }

  getPack(id) {
    return this.queryOne('SELECT * FROM item_packs WHERE id = ?', [id]);
  }

  savePack(pack) {
    const itemsJson = JSON.stringify(pack.items || []);
    if (pack.id) {
      this.db.run(
        `UPDATE item_packs SET name = ?, pack_type = ?, items_json = ?, enabled = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
        [pack.name, pack.pack_type, itemsJson, pack.enabled ? 1 : 0, pack.id]
      );
    } else {
      this.db.run(
        'INSERT INTO item_packs (name, pack_type, items_json, enabled) VALUES (?, ?, ?, ?)',
        [pack.name, pack.pack_type, itemsJson, pack.enabled ? 1 : 0]
      );
    }
    this.save();
    return this.queryOne('SELECT * FROM item_packs WHERE name = ? ORDER BY id DESC LIMIT 1', [pack.name]);
  }

  deletePack(id) {
    this.db.run('DELETE FROM item_packs WHERE id = ?', [id]);
    this.save();
  }

  // ── Welcome pack tracking ──
  isWelcomed(serverId, steamId) {
    return !!this.queryOne('SELECT * FROM welcomed_players WHERE server_id = ? AND steam_id = ?', [serverId, steamId]);
  }

  markWelcomed(serverId, steamId) {
    this.db.run(
      'INSERT OR IGNORE INTO welcomed_players (server_id, steam_id) VALUES (?, ?)',
      [serverId, steamId]
    );
    this.save();
  }

  // ── Pending (delayed) welcome ──
  addPendingWelcome(serverId, steamId) {
    this.db.run(
      'INSERT OR IGNORE INTO pending_welcome (server_id, steam_id, first_seen_at) VALUES (?, ?, datetime(\'now\',\'localtime\'))',
      [serverId, steamId]
    );
    this.save();
  }

  getPendingWelcome(serverId, steamId) {
    return this.queryOne('SELECT * FROM pending_welcome WHERE server_id = ? AND steam_id = ?', [serverId, steamId]);
  }

  getPendingWelcomes(serverId) {
    return this.query('SELECT * FROM pending_welcome WHERE server_id = ?', [serverId]);
  }

  deletePendingWelcome(serverId, steamId) {
    this.db.run('DELETE FROM pending_welcome WHERE server_id = ? AND steam_id = ?', [serverId, steamId]);
    this.save();
  }
}

module.exports = Database;
