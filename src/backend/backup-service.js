// Copyright (c) 2026 Kruzio
// Licensed under the PolyForm Noncommercial License 1.0.0.
// Non-commercial use only. Commercial use and selling of this code are prohibited.
// Derivative works must retain this license and link to: https://github.com/kruzio1985/Ark-Admin-Manager
// https://polyformproject.org/licenses/noncommercial/1.0.0/

/**
 * Ark Admin Manager — Backup Service
 * Tworzy backupy serwerów ARK przez kopiowanie folderów (bez zewnętrznych zależności)
 */
const path = require('path');
const fs = require('fs');

class BackupService {
  constructor(db, appDataDir) {
    this.db = db;
    this.appDataDir = appDataDir;
    this.backupsDir = path.join(appDataDir, 'backups');
  }

  // ═══════════════════════════════════════════════════════════════════
  // BACKUP CONFIG
  // ═══════════════════════════════════════════════════════════════════

  async getBackupConfig() {
    return this.db.queryOne('SELECT * FROM backup_config WHERE id = 1');
  }

  async saveBackupConfig(config) {
    const fields = ['enabled', 'period_minutes', 'parallel_backup', 'delete_old',
                    'delete_days', 'world_save_message', 'backup_path', 'include_saved'];
    const sets = [];
    const values = [];

    for (const f of fields) {
      if (config[f] !== undefined) {
        sets.push(`${f} = ?`);
        values.push(config[f]);
      }
    }

    if (sets.length > 0) {
      sets.push("updated_at = datetime('now','localtime')");
      this.db.run(`UPDATE backup_config SET ${sets.join(', ')} WHERE id = 1`, values);
      this.db.save();
    }

    return this.getBackupConfig();
  }

  // ═══════════════════════════════════════════════════════════════════
  // BACKUP OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

  async listBackups(serverId) {
    return this.db.query(
      'SELECT * FROM backups WHERE server_id = ? ORDER BY created_at DESC',
      [serverId]
    );
  }

  async createBackup(serverId, options = {}) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) throw new Error(`Server ${serverId} not found`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `${server.name}_${timestamp}`;
    const backupDir = path.join(this.backupsDir, String(serverId));
    const backupPath = path.join(backupDir, backupName);

    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true });
    }

    let totalSize = 0;

    // 1. Copy server saved data (world files)
    if (server.install_path) {
      const savedDir = path.join(server.install_path, 'ShooterGame', 'Saved');
      if (fs.existsSync(savedDir)) {
        const destSaved = path.join(backupPath, 'Saved');
        this._copyDirSync(savedDir, destSaved);
        totalSize += this._getDirSize(destSaved);
      }
    }

    // 2. Save config from DB as JSON
    try {
      const configParser = new (require('./config-parser.js'))(this.db);
      const configData = await configParser.exportConfig(serverId);
      const configDir = path.join(backupPath, 'Config');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(configData, null, 2));
    } catch (e) { console.error('[BackupService] Config export failed:', e.message); }

    // 3. Save server DB info
    const dbDir = path.join(backupPath, 'DB');
    fs.mkdirSync(dbDir, { recursive: true });
    fs.writeFileSync(path.join(dbDir, 'server_info.json'), JSON.stringify(server, null, 2));

    // Record in DB
    this.db.run(
      `INSERT INTO backups (server_id, file_path, size_bytes, type, created_at)
       VALUES (?, ?, ?, ?, datetime('now','localtime'))`,
      [serverId, backupPath, totalSize, options.type || 'manual']
    );
    this.db.save();

    const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
    console.log(`[BackupService] Created backup: ${backupPath} (${sizeMB} MB)`);

    // Get the new backup ID
    const rows = this.db.query('SELECT id FROM backups ORDER BY id DESC LIMIT 1');

    // Rotacja (usuwanie starych backupów)
    try { await this.runRotation(); } catch (e) { console.error('[BackupService] Rotation failed:', e.message); }

    return {
      id: rows[0]?.id,
      serverId,
      filePath: backupPath,
      sizeBytes: totalSize,
      createdAt: new Date().toISOString(),
    };
  }

  /** Rotacja/retencja: usuwa backupy starsze niż delete_days (jeśli delete_old=1). */
  async runRotation() {
    const cfg = await this.getBackupConfig();
    if (!cfg || !cfg.delete_old) return { removed: 0 };
    const days = parseInt(cfg.delete_days, 10) || 30;
    const cutoff = Date.now() - days * 24 * 3600 * 1000;
    const backups = this.db.query('SELECT * FROM backups');
    let removed = 0;
    for (const b of backups) {
      let createdTs;
      try { createdTs = new Date(String(b.created_at || '').replace(' ', 'T')).getTime(); }
      catch { createdTs = 0; }
      if (createdTs && createdTs < cutoff) {
        try { await this.deleteBackup(b.id); removed++; } catch (e) { console.error('[BackupService] delete old backup fail:', e.message); }
      }
    }
    if (removed) console.log(`[BackupService] Rotacja: usunięto ${removed} starych backupów (starsze niż ${days} dni)`);
    return { removed };
  }

  async restoreBackup(backupId) {
    const backup = this.db.queryOne('SELECT * FROM backups WHERE id = ?', [backupId]);
    if (!backup) throw new Error(`Backup ${backupId} not found`);
    if (!fs.existsSync(backup.file_path)) throw new Error(`Backup folder not found: ${backup.file_path}`);

    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [backup.server_id]);
    if (!server) throw new Error(`Server ${backup.server_id} not found`);

    // Restore Saved folder
    const savedSrc = path.join(backup.file_path, 'Saved');
    if (fs.existsSync(savedSrc) && server.install_path) {
      const savedDest = path.join(server.install_path, 'ShooterGame', 'Saved');
      if (fs.existsSync(savedDest)) {
        const prePath = path.join(this.backupsDir, String(server.id), `pre_restore_${Date.now()}`);
        fs.renameSync(savedDest, prePath);
        console.log(`[BackupService] Pre-restore safety: ${prePath}`);
      }
      this._copyDirSync(savedSrc, savedDest);
    }

    // Restore config
    const configFile = path.join(backup.file_path, 'Config', 'config.json');
    if (fs.existsSync(configFile)) {
      try {
        const configData = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        const configParser = new (require('./config-parser.js'))(this.db);
        await configParser.importConfig(server.id, configData);
      } catch (e) { console.error('[BackupService] Config restore failed:', e.message); }
    }

    console.log(`[BackupService] Restored backup ${backupId} to server ${server.name}`);
    return { success: true, serverId: server.id };
  }

  async deleteBackup(backupId) {
    const backup = this.db.queryOne('SELECT * FROM backups WHERE id = ?', [backupId]);
    if (!backup) throw new Error(`Backup ${backupId} not found`);
    if (fs.existsSync(backup.file_path)) {
      fs.rmSync(backup.file_path, { recursive: true });
    }
    this.db.run('DELETE FROM backups WHERE id = ?', [backupId]);
    this.db.save();
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════
  // CLOUD / FTP BACKUP (offsite)
  // ═══════════════════════════════════════════════════════════════════

  /** Wysyła backup (folder) na serwer FTP (minimalny klient FTP, passive mode). */
  async ftpUpload(backupId, cfg = {}) {
    const backup = this.db.queryOne('SELECT * FROM backups WHERE id = ?', [backupId]);
    if (!backup) throw new Error(`Backup ${backupId} not found`);
    if (!fs.existsSync(backup.file_path)) throw new Error(`Backup folder not found: ${backup.file_path}`);

    const host = cfg.host, port = parseInt(cfg.port, 10) || 21, user = cfg.user || 'anonymous', pass = cfg.pass || '';
    const remoteDir = (cfg.remoteDir || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!host) throw new Error('Brak hosta FTP');

    const net = require('net');
    const control = await this._ftpConnect(host, port);
    try {
      await this._ftpCommand(control, `USER ${user}`, [230, 331]);
      if (!(await this._ftpCommand(control, `PASS ${pass}`, [230, 202])).startsWith('230')) {
        // 331 → password ok? kontynuuj
      }
      await this._ftpCommand(control, 'TYPE I', [200]);
      // Utwórz katalog zdalny (best-effort)
      if (remoteDir) {
        const parts = remoteDir.split('/');
        let cur = '';
        for (const p of parts) {
          if (!p) continue;
          cur += '/' + p;
          await this._ftpCommand(control, `MKD ${cur}`, [257, 550]).catch(() => {});
          await this._ftpCommand(control, `CWD ${cur}`, [250]).catch(() => {});
        }
      }
      const files = this._collectFiles(backup.file_path);
      let uploaded = 0;
      for (const f of files) {
        const rel = path.relative(backup.file_path, f).replace(/\\/g, '/');
        const remoteFile = (remoteDir ? '/' + remoteDir : '') + '/' + rel;
        await this._ftpStor(control, f, remoteFile);
        uploaded++;
      }
      control.destroy();
      return { success: true, uploaded, files: files.length, host };
    } catch (e) {
      control.destroy();
      throw e;
    }
  }

  _ftpConnect(host, port) {
    const net = require('net');
    return new Promise((resolve, reject) => {
      const sock = net.createConnection({ host, port });
      const onData = (d) => { sock._buf = (sock._buf || '') + d.toString(); };
      sock.on('data', onData);
      sock.once('connect', () => {});
      sock.once('error', reject);
      // czekaj na powitanie
      const t = setTimeout(() => reject(new Error('FTP connect timeout')), 15000);
      sock.on('data', function wait() {
        if (sock._buf && /\d{3} /.test(sock._buf)) { clearTimeout(t); resolve(sock); }
      });
    });
  }

  _ftpCommand(sock, cmd, okCodes = [200]) {
    return new Promise((resolve, reject) => {
      sock._buf = '';
      const onData = (d) => {
        sock._buf = (sock._buf || '') + d.toString();
        const m = sock._buf.match(/(\d{3}) /);
        if (m) {
          const code = parseInt(m[1], 10);
          if (okCodes.includes(code) || (code >= 200 && code < 400)) {
            sock.removeListener('data', onData);
            resolve(m[0]);
          } else if (code >= 500) {
            sock.removeListener('data', onData);
            reject(new Error(`FTP ${cmd}: ${sock._buf.trim()}`));
          }
        }
      };
      sock.on('data', onData);
      sock.write(cmd + '\r\n');
      setTimeout(() => { sock.removeListener('data', onData); reject(new Error(`FTP ${cmd} timeout`)); }, 20000);
    });
  }

  _ftpPasv(sock) {
    return new Promise((resolve, reject) => {
      sock._buf = '';
      const onData = (d) => {
        sock._buf = (sock._buf || '') + d.toString();
        const m = sock._buf.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
        if (m) {
          sock.removeListener('data', onData);
          const ip = [m[1], m[2], m[3], m[4]].join('.');
          const port = (parseInt(m[5], 10) << 8) + parseInt(m[6], 10);
          resolve({ ip, port });
        }
      };
      sock.on('data', onData);
      sock.write('PASV\r\n');
      setTimeout(() => { sock.removeListener('data', onData); reject(new Error('PASV timeout')); }, 15000);
    });
  }

  _ftpStor(sock, localFile, remoteFile) {
    const net = require('net');
    return new Promise((resolve, reject) => {
      this._ftpPasv(sock).then(({ ip, port }) => {
        const data = net.createConnection({ host: ip, port });
        this._ftpCommand(sock, `STOR ${remoteFile}`, [125, 150]).then(() => {
          const stream = fs.createReadStream(localFile);
          stream.on('data', (c) => data.write(c));
          stream.on('end', () => data.end());
          stream.on('error', reject);
        }).catch(reject);
        data.on('error', reject);
        data.on('close', () => this._ftpCommand(sock, 'NOOP', [200]).then(resolve).catch(resolve));
      }).catch(reject);
    });
  }

  _collectFiles(dir) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...this._collectFiles(p));
      else out.push(p);
    }
    return out;
  }

  _copyDirSync(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) { this._copyDirSync(s, d); }
      else { fs.copyFileSync(s, d); }
    }
  }

  _getDirSize(dirPath) {
    let size = 0;
    if (!fs.existsSync(dirPath)) return 0;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const p = path.join(dirPath, entry.name);
      if (entry.isDirectory()) { size += this._getDirSize(p); }
      else { try { size += fs.statSync(p).size; } catch (_) {} }
    }
    return size;
  }
}

module.exports = BackupService;
