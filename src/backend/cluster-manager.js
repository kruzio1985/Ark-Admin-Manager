/**
 * Ark Admin Manager — Cluster Manager
 * Zarządza klastrami ARK: tworzenie, konfiguracja cross-ARK, synchronizacja
 * 
 * KLUCZOWE: Cluster działa przez współdzielony ClusterDirOverride/ClusterIdOverride
 * w Game.ini i GameUserSettings.ini. Wszystkie serwery w klastrze muszą mieć
 * TEN SAM cluster_id i dostęp do wspólnego folderu cluster.
 */
const path = require('path');
const fs = require('fs');

class ClusterManager {
  constructor(db, configParser, serverManager) {
    this.db = db;
    this.configParser = configParser;
    this.serverManager = serverManager || null;
  }

  // ═══════════════════════════════════════════════════════════════════
  // CLUSTER CRUD
  // ═══════════════════════════════════════════════════════════════════

  async listClusters() {
    const clusters = this.db.query('SELECT * FROM clusters ORDER BY name');
    for (const cluster of clusters) {
      const servers = this.db.query(
        `SELECT s.id, s.name, s.status, s.map_name, s.port, s.game_type, s.cluster_id
         FROM servers s
         JOIN cluster_servers cs ON s.id = cs.server_id
         WHERE cs.cluster_id = ?`,
        [cluster.id]
      );
      cluster.servers = servers;
      cluster.serverCount = servers.length;
    }
    return clusters;
  }

  async getCluster(id) {
    const cluster = this.db.queryOne('SELECT * FROM clusters WHERE id = ?', [id]);
    if (!cluster) return null;

    const servers = this.db.query(
      `SELECT s.id, s.name, s.status, s.map_name, s.port, s.game_type,
              s.install_path, s.server_password, s.admin_password, s.cluster_id
       FROM servers s
       JOIN cluster_servers cs ON s.id = cs.server_id
       WHERE cs.cluster_id = ?`,
      [id]
    );
    cluster.servers = servers;
    return cluster;
  }

  async createCluster(data) {
    const { name, description, game_type } = data;
    const clusterId = data.cluster_id || `cluster_${Date.now()}`;

    const existing = this.db.queryOne('SELECT id FROM clusters WHERE cluster_id = ?', [clusterId]);
    if (existing) throw new Error(`Cluster with ID "${clusterId}" already exists`);

    this.db.run(
      `INSERT INTO clusters (name, description, cluster_id, game_type) VALUES (?, ?, ?, ?)`,
      [name, description || '', clusterId, game_type || 'ASE']
    );
    this.db.save();

    const rows = this.db.query('SELECT id FROM clusters WHERE cluster_id = ?', [clusterId]);
    const newId = rows[0]?.id;
    console.log(`[ClusterManager] Created cluster "${name}" (id=${newId}, clusterId=${clusterId})`);

    return this.getCluster(newId);
  }

  async deleteCluster(id) {
    const cluster = this.db.queryOne('SELECT * FROM clusters WHERE id = ?', [id]);
    if (!cluster) throw new Error(`Cluster ${id} not found`);

    // Remove cluster_id from all servers in this cluster
    const servers = this.db.query('SELECT server_id FROM cluster_servers WHERE cluster_id = ?', [id]);
    for (const s of servers) {
      this.db.run('UPDATE servers SET cluster_id = NULL WHERE id = ?', [s.server_id]);
    }

    this.db.run('DELETE FROM clusters WHERE id = ?', [id]);
    this.db.save();
    return true;
  }

  async updateCluster(id, data) {
    const cluster = this.db.queryOne('SELECT * FROM clusters WHERE id = ?', [id]);
    if (!cluster) throw new Error(`Cluster ${id} not found`);

    const name = data.name?.trim() || cluster.name;
    const description = data.description !== undefined ? data.description : cluster.description;
    const game_type = data.game_type || cluster.game_type;
    const newClusterId = (data.cluster_id || '').trim() || cluster.cluster_id;

    // Unikalność nowego cluster_id (poza sobą)
    const dup = this.db.queryOne('SELECT id FROM clusters WHERE cluster_id = ? AND id != ?', [newClusterId, id]);
    if (dup) throw new Error(`Cluster with ID "${newClusterId}" already exists`);

    this.db.run(
      'UPDATE clusters SET name = ?, description = ?, game_type = ?, cluster_id = ? WHERE id = ?',
      [name, description || '', game_type, newClusterId, id]
    );

    // Zaktualizuj cluster_id we wszystkich serwerach klastra
    this.db.run(
      'UPDATE servers SET cluster_id = ? WHERE id IN (SELECT server_id FROM cluster_servers WHERE cluster_id = ?)',
      [newClusterId, id]
    );
    this.db.save();
    console.log(`[ClusterManager] Cluster "${name}" zaktualizowany (ID: ${newClusterId})`);
    return this.getCluster(id);
  }

  // ═══════════════════════════════════════════════════════════════════
  // SERVER MANAGEMENT IN CLUSTER
  // ═══════════════════════════════════════════════════════════════════

  async addServer(clusterId, serverId) {
    const cluster = this.db.queryOne('SELECT * FROM clusters WHERE id = ?', [clusterId]);
    if (!cluster) throw new Error(`Cluster ${clusterId} not found`);

    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) throw new Error(`Server ${serverId} not found`);

    // Check game type compatibility
    if (server.game_type !== cluster.game_type) {
      throw new Error(`Server game type (${server.game_type}) doesn't match cluster (${cluster.game_type})`);
    }

    // Check if already in cluster
    const existing = this.db.queryOne(
      'SELECT * FROM cluster_servers WHERE cluster_id = ? AND server_id = ?',
      [clusterId, serverId]
    );

    if (!existing) {
      this.db.run(
        'INSERT INTO cluster_servers (cluster_id, server_id) VALUES (?, ?)',
        [clusterId, serverId]
      );
    }

    // Update server's cluster_id
    const isASA = server.game_type === 'ASA';
    const clusterKey = isASA ? 'ClusterIdOverride' : 'ClusterDirOverride';
    
    this.db.run(`UPDATE servers SET cluster_id = ? WHERE id = ?`, [cluster.cluster_id, serverId]);
    this.db.save();

    // Update GameUserSettings.ini with cluster dir override
    // For ASE: ?ClusterDirOverride=cluster_id
    // For ASA: ?-ClusterIdOverride=cluster_id

    console.log(`[ClusterManager] Added server ${server.name} to cluster ${cluster.name}`);
    this.db.logActivity(serverId, 'cluster_join', 0, `Joined cluster "${cluster.name}"`);

    return this.getCluster(clusterId);
  }

  async removeServer(clusterId, serverId) {
    this.db.run('DELETE FROM cluster_servers WHERE cluster_id = ? AND server_id = ?', [clusterId, serverId]);
    this.db.run('UPDATE servers SET cluster_id = NULL WHERE id = ?', [serverId]);
    this.db.save();

    this.db.logActivity(serverId, 'cluster_leave', 0, 'Left cluster');
    return this.getCluster(clusterId);
  }

  async getClusterServers(clusterId) {
    return this.db.query(
      `SELECT s.* FROM servers s
       JOIN cluster_servers cs ON s.id = cs.server_id
       WHERE cs.cluster_id = ?`,
      [clusterId]
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // CLUSTER CONFIG SYNC
  // ═══════════════════════════════════════════════════════════════════

  /** Dla ASE cluster_id to ŚCIEŻKA folderu — upewniamy się, że folder istnieje. */
  ensureClusterFolder(cluster) {
    if (!cluster || cluster.game_type === 'ASA') return null;
    const folder = cluster.cluster_id;
    if (!folder) return null;
    const abs = /^[A-Za-z]:[\\/]/.test(folder) || folder.startsWith('\\\\');
    if (!abs) {
      console.warn(`[ClusterManager] ASE cluster_id "${folder}" nie jest ścieżką absolutną — podaj pełną ścieżkę (np. D:\\cluster_bio)`);
      return null;
    }
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
      console.log(`[ClusterManager] Utworzono folder cluster: ${folder}`);
    }
    return folder;
  }

  async syncClusterConfig(clusterId) {
    const cluster = await this.getCluster(clusterId);
    if (!cluster) throw new Error(`Cluster ${clusterId} not found`);

    const folder = this.ensureClusterFolder(cluster);
    const results = [];

    for (const server of cluster.servers) {
      try {
        // Upewnij się, że serwer ma cluster_id = ID klastra
        if (server.cluster_id !== cluster.cluster_id) {
          this.db.run('UPDATE servers SET cluster_id = ? WHERE id = ?', [cluster.cluster_id, server.id]);
        }

        // Wpisz ustawienie klastra do configu (Game.ini / GameUserSettings.ini przez saveConfig)
        const config = await this.configParser.getConfig(server.id);
        if (!config.administration) config.administration = {};
        if (server.game_type === 'ASA') {
          config.administration.ClusterIdOverride = cluster.cluster_id;
        } else {
          config.administration.ClusterDirOverride = cluster.cluster_id;
        }
        await this.configParser.saveConfig(server.id, config);

        results.push({ serverId: server.id, name: server.name, success: true, folder });
      } catch (e) {
        results.push({ serverId: server.id, name: server.name, success: false, error: e.message });
      }
    }
    this.db.save();
    return { clusterId, folder, results };
  }

  async validateCluster(clusterId) {
    const cluster = await this.getCluster(clusterId);
    if (!cluster) throw new Error(`Cluster ${clusterId} not found`);

    const issues = [];
    const servers = cluster.servers;

    // Check minimum servers
    if (servers.length < 2) {
      issues.push({ severity: 'warning', message: 'Cluster needs at least 2 servers for cross-ARK travel' });
    }

    // Check for duplicate maps
    const maps = servers.map(s => s.map_name);
    const duplicateMaps = maps.filter((m, i) => maps.indexOf(m) !== i);
    if (duplicateMaps.length > 0) {
      issues.push({
        severity: 'warning',
        message: `Duplicate maps detected: ${[...new Set(duplicateMaps)].join(', ')}. This may cause issues with cross-server travel.`
      });
    }

    // Check for duplicate ports
    const ports = servers.map(s => s.port);
    const duplicatePorts = ports.filter((p, i) => ports.indexOf(p) !== i);
    if (duplicatePorts.length > 0) {
      issues.push({
        severity: 'error',
        message: `Duplicate ports detected: ${[...new Set(duplicatePorts)].join(', ')}. Each server must have unique ports.`
      });
    }

    // Check all servers have install paths
    const missingPaths = servers.filter(s => !s.install_path);
    if (missingPaths.length > 0) {
      issues.push({
        severity: 'error',
        message: `Servers without install path: ${missingPaths.map(s => s.name).join(', ')}. Install servers first.`
      });
    }

    // Check cluster ID consistency
    const isASA = servers[0]?.game_type === 'ASA';
    const inconsistentIds = servers.filter(s => s.cluster_id !== cluster.cluster_id);
    if (inconsistentIds.length > 0) {
      issues.push({
        severity: 'error',
        message: `Servers with different cluster_id: ${inconsistentIds.map(s => s.name).join(', ')}`
      });
    }

    // Shared folder check (ASE)
    if (!isASA && cluster.cluster_id) {
      if (!fs.existsSync(cluster.cluster_id)) {
        issues.push({ severity: 'warning', message: `Cluster folder doesn't exist yet: ${cluster.cluster_id} (will be created on Sync)` });
      } else {
        try {
          fs.accessSync(cluster.cluster_id, fs.constants.W_OK);
        } catch {
          issues.push({ severity: 'error', message: `Cluster folder is not writable: ${cluster.cluster_id}` });
        }
      }
    }

    return {
      valid: issues.filter(i => i.severity === 'error').length === 0,
      serversChecked: servers.length,
      issues,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PROFILE SYNC (wybiórczy)
  // ═══════════════════════════════════════════════════════════════════

  async selectiveSyncProfiles(sourceId, targetIds, options = {}) {
    const source = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [sourceId]);
    if (!source) throw new Error(`Source server ${sourceId} not found`);
    const results = [];

    for (const targetId of targetIds) {
      try {
        const copied = [];

        if (options.sync_cluster_id) {
          this.db.run('UPDATE servers SET cluster_id = ? WHERE id = ?', [source.cluster_id || null, targetId]);
          copied.push('cluster_id');
        }

        if (options.sync_auto_shutdown) {
          this.db.run('UPDATE servers SET auto_start = ?, auto_restart = ?, auto_update = ? WHERE id = ?',
            [source.auto_start || 0, source.auto_restart || 0, source.auto_update || 0, targetId]);
          copied.push('auto_start/restart/update');
        }

        if (options.sync_mod_ids) {
          this.db.run('DELETE FROM server_mods WHERE server_id = ?', [targetId]);
          const mods = this.db.query('SELECT * FROM server_mods WHERE server_id = ?', [sourceId]);
          for (const m of mods) {
            this.db.run(
              'INSERT OR REPLACE INTO server_mods (server_id, mod_id, mod_name, game_type, active) VALUES (?, ?, ?, ?, ?)',
              [targetId, m.mod_id, m.mod_name, m.game_type, m.active]
            );
          }
          copied.push(`mods (${mods.length})`);
        }

        // Sekcje configu — kopiuj wybrane fragmenty JSON
        const sectionMap = {
          sync_custom_levels: ['levels', 'customLevels', 'experience', 'playerLevels', 'dinoLevels'],
          sync_engrams: ['engrams', 'engramEntries', 'engramOverrides', 'customEngrams'],
        };
        const wantedSections = [];
        for (const [key, sections] of Object.entries(sectionMap)) {
          if (options[key]) wantedSections.push(...sections);
        }

        if (wantedSections.length || (!options.sync_mod_ids && !options.sync_cluster_id && !options.sync_auto_shutdown && !options.sync_custom_levels && !options.sync_engrams)) {
          // Brak zaznaczonych opcji → pełna kopia (stare zachowanie); inaczej kopiuj tylko wybrane sekcje
          const srcConfig = await this.configParser.getConfig(sourceId);
          const tgtConfig = await this.configParser.getConfig(targetId);
          if (wantedSections.length) {
            for (const sec of wantedSections) {
              if (srcConfig[sec] !== undefined) tgtConfig[sec] = JSON.parse(JSON.stringify(srcConfig[sec]));
            }
            copied.push(`config sections: ${[...new Set(wantedSections)].join(', ')}`);
          } else {
            const exported = await this.configParser.exportConfig(sourceId);
            await this.configParser.importConfig(targetId, exported);
            copied.push('full config');
          }
          if (wantedSections.length) await this.configParser.saveConfig(targetId, tgtConfig);
        }

        this.db.save();
        results.push({ serverId: targetId, name: (this.db.queryOne('SELECT name FROM servers WHERE id = ?', [targetId])?.name), success: true, copied });
      } catch (e) {
        results.push({ serverId: targetId, success: false, error: e.message });
      }
    }
    return results;
  }

  // ═══════════════════════════════════════════════════════════════════
  // APPLY TO CLUSTER (jedna zmiana na wszystkie serwery)
  // ═══════════════════════════════════════════════════════════════════

  async applyConfigToCluster(clusterId, section, values) {
    const cluster = await this.getCluster(clusterId);
    if (!cluster) throw new Error(`Cluster ${clusterId} not found`);
    const results = [];
    for (const server of cluster.servers) {
      try {
        await this.configParser.mergeConfig(server.id, section, values || {});
        results.push({ serverId: server.id, name: server.name, success: true });
      } catch (e) {
        results.push({ serverId: server.id, name: server.name, success: false, error: e.message });
      }
    }
    return results;
  }

  async applyModsToCluster(clusterId, modIds) {
    const cluster = await this.getCluster(clusterId);
    if (!cluster) throw new Error(`Cluster ${clusterId} not found`);
    const ids = (Array.isArray(modIds) ? modIds : String(modIds || '').split(','))
      .map(m => m.trim()).filter(Boolean);
    const results = [];
    for (const server of cluster.servers) {
      try {
        for (const modId of ids) {
          this.db.run(
            'INSERT OR REPLACE INTO server_mods (server_id, mod_id, mod_name, game_type, active) VALUES (?, ?, ?, ?, 1)',
            [server.id, modId, `Mod ${modId}`, server.game_type]
          );
        }
        results.push({ serverId: server.id, name: server.name, success: true });
      } catch (e) {
        results.push({ serverId: server.id, name: server.name, success: false, error: e.message });
      }
    }
    this.db.save();
    return { applied: ids.length, results };
  }

  async syncModsAcrossCluster(clusterId) {
    const cluster = await this.getCluster(clusterId);
    if (!cluster) throw new Error(`Cluster ${clusterId} not found`);
    if (cluster.servers.length < 2) throw new Error('Cluster needs at least 2 servers');

    // Unia modów ze wszystkich serwerów
    const union = new Map();
    for (const server of cluster.servers) {
      const mods = this.db.query('SELECT * FROM server_mods WHERE server_id = ?', [server.id]);
      for (const m of mods) if (!union.has(m.mod_id)) union.set(m.mod_id, m);
    }
    const results = [];
    for (const server of cluster.servers) {
      try {
        this.db.run('DELETE FROM server_mods WHERE server_id = ?', [server.id]);
        for (const m of union.values()) {
          this.db.run(
            'INSERT INTO server_mods (server_id, mod_id, mod_name, game_type, active) VALUES (?, ?, ?, ?, ?)',
            [server.id, m.mod_id, m.mod_name, server.game_type, 1]
          );
        }
        results.push({ serverId: server.id, name: server.name, success: true });
      } catch (e) {
        results.push({ serverId: server.id, name: server.name, success: false, error: e.message });
      }
    }
    this.db.save();
    return { totalMods: union.size, results };
  }

  // ═══════════════════════════════════════════════════════════════════
  // CLUSTER DATA (survivors / tribes)
  // ═══════════════════════════════════════════════════════════════════

  _savedDir(server) {
    if (!server?.install_path) return null;
    return path.join(server.install_path, 'ShooterGame', 'Saved');
  }

  listClusterData(clusterId) {
    const cluster = this.db.queryOne('SELECT * FROM clusters WHERE id = ?', [clusterId]);
    if (!cluster) throw new Error(`Cluster ${clusterId} not found`);
    const servers = this.db.query(
      `SELECT s.* FROM servers s JOIN cluster_servers cs ON s.id = cs.server_id WHERE cs.cluster_id = ?`, [clusterId]
    );
    const files = [];
    for (const server of servers) {
      const saved = this._savedDir(server);
      if (!saved || !fs.existsSync(saved)) continue;
      let entries = [];
      try { entries = fs.readdirSync(saved); } catch { continue; }
      for (const name of entries) {
        const full = path.join(saved, name);
        let type = null;
        if (name.endsWith('.arkprofile')) type = 'survivor';
        else if (name.endsWith('.arktribe')) type = 'tribe';
        else continue;
        let size = 0;
        try { size = fs.statSync(full).size; } catch {}
        files.push({ fileName: name, serverId: server.id, serverName: server.name, type, size, path: full });
      }
    }
    return files;
  }

  transferClusterData(clusterId, fileName, targetServerId) {
    const files = this.listClusterData(clusterId);
    const found = files.find(f => f.fileName === fileName && f.serverId !== targetServerId);
    if (!found) throw new Error(`File ${fileName} not found (or already on target)`);
    const target = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [targetServerId]);
    if (!target) throw new Error(`Target server ${targetServerId} not found`);
    const destDir = this._savedDir(target);
    if (!destDir) throw new Error('Target server not installed');
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, fileName);
    fs.copyFileSync(found.path, dest);
    return { from: found.serverName, to: target.name, fileName, dest };
  }

  backupClusterFolder(clusterId) {
    const cluster = this.db.queryOne('SELECT * FROM clusters WHERE id = ?', [clusterId]);
    if (!cluster) throw new Error(`Cluster ${clusterId} not found`);
    const sources = [];
    if (cluster.game_type === 'ASA') {
      // ASA: każdy serwer ma własny folder clustra w Saved/clusters
      const servers = this.db.query(
        `SELECT s.* FROM servers s JOIN cluster_servers cs ON s.id = cs.server_id WHERE cs.cluster_id = ?`, [clusterId]
      );
      for (const s of servers) {
        const dir = this._savedDir(s);
        if (dir) sources.push(path.join(dir, 'clusters'));
      }
    } else {
      if (cluster.cluster_id) sources.push(cluster.cluster_id);
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const destRoot = path.join('D:\\backup', 'clusters', `${cluster.name}_${ts}`);
    let count = 0;
    for (const src of sources) {
      if (!src || !fs.existsSync(src)) continue;
      const name = path.basename(src) === 'clusters' ? `${path.basename(path.dirname(src))}_clusters` : path.basename(src);
      const dest = path.join(destRoot, name);
      fs.mkdirSync(dest, { recursive: true });
      fs.cpSync(src, dest, { recursive: true });
      count++;
    }
    if (count === 0) throw new Error('No cluster data folders found (cluster folder may be empty or servers not installed)');
    return { path: destRoot, copied: count };
  }

  // ═══════════════════════════════════════════════════════════════════
  // BASELINES (snapshot + rollback)
  // ═══════════════════════════════════════════════════════════════════

  async createBaseline(clusterId, name) {
    const cluster = await this.getCluster(clusterId);
    if (!cluster) throw new Error(`Cluster ${clusterId} not found`);
    const snapshots = {};
    for (const server of cluster.servers) {
      snapshots[server.id] = await this.configParser.getConfig(server.id);
    }
    this.db.run(
      'INSERT INTO cluster_baselines (cluster_id, name, snapshots_json) VALUES (?, ?, ?)',
      [clusterId, name || `Baseline ${new Date().toLocaleString()}`, JSON.stringify(snapshots)]
    );
    this.db.save();
    return this.listBaselines(clusterId);
  }

  listBaselines(clusterId) {
    return this.db.query('SELECT id, cluster_id, name, created_at FROM cluster_baselines WHERE cluster_id = ? ORDER BY id DESC', [clusterId]);
  }

  async restoreBaseline(baselineId) {
    const baseline = this.db.queryOne('SELECT * FROM cluster_baselines WHERE id = ?', [baselineId]);
    if (!baseline) throw new Error(`Baseline ${baselineId} not found`);
    const snapshots = JSON.parse(baseline.snapshots_json || '{}');
    const results = [];
    for (const [serverId, config] of Object.entries(snapshots)) {
      try {
        await this.configParser.saveConfig(parseInt(serverId, 10), config);
        results.push({ serverId: parseInt(serverId, 10), success: true });
      } catch (e) {
        results.push({ serverId: parseInt(serverId, 10), success: false, error: e.message });
      }
    }
    return results;
  }

  deleteBaseline(baselineId) {
    this.db.run('DELETE FROM cluster_baselines WHERE id = ?', [baselineId]);
    this.db.save();
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════
  // DIAGNOSTICS & ACTIONS
  // ═══════════════════════════════════════════════════════════════════

  async diagnoseCluster(clusterId) {
    const cluster = await this.getCluster(clusterId);
    if (!cluster) throw new Error(`Cluster ${clusterId} not found`);
    const checks = [];
    const servers = cluster.servers;

    checks.push({ check: 'Servers in cluster', ok: servers.length >= 2, detail: `${servers.length} servers (min 2 for travel)` });

    const maps = servers.map(s => s.map_name);
    const dupMaps = maps.filter((m, i) => maps.indexOf(m) !== i);
    checks.push({ check: 'Unique maps', ok: dupMaps.length === 0, detail: dupMaps.length ? `Duplicate: ${[...new Set(dupMaps)].join(', ')}` : 'All unique' });

    const ports = servers.map(s => s.port);
    const dupPorts = ports.filter((p, i) => ports.indexOf(p) !== i);
    checks.push({ check: 'Unique ports', ok: dupPorts.length === 0, detail: dupPorts.length ? `Duplicate: ${[...new Set(dupPorts)].join(', ')}` : 'All unique' });

    const badIds = servers.filter(s => s.cluster_id !== cluster.cluster_id);
    checks.push({ check: 'Same cluster_id', ok: badIds.length === 0, detail: badIds.length ? `Mismatch: ${badIds.map(s => s.name).join(', ')}` : 'All match' });

    if (cluster.game_type === 'ASE' && cluster.cluster_id) {
      const abs = /^[A-Za-z]:[\\/]/.test(cluster.cluster_id) || cluster.cluster_id.startsWith('\\\\');
      checks.push({ check: 'Shared folder (absolute path)', ok: abs, detail: abs ? cluster.cluster_id : `${cluster.cluster_id} — ASE wymaga PEŁNEJ ścieżki (np. D:\cluster_bio)` });
      if (abs) {
        const exists = fs.existsSync(cluster.cluster_id);
        checks.push({ check: 'Shared folder exists', ok: exists, detail: exists ? cluster.cluster_id : `${cluster.cluster_id} (brak — uruchom Sync)` });
      }
    }

    // Mod consistency
    const modSets = servers.map(s => {
      const mods = this.db.query('SELECT mod_id FROM server_mods WHERE server_id = ? AND active = 1', [s.id]);
      return { name: s.name, ids: mods.map(m => m.mod_id).sort() };
    });
    const ref = modSets[0]?.ids.join(',') || '';
    const modOk = modSets.every(m => m.ids.join(',') === ref);
    checks.push({ check: 'Mods consistent', ok: modOk, detail: modOk ? `${modSets[0]?.ids.length || 0} mods identical` : 'Mods differ between servers' });

    return {
      cluster: cluster.name,
      gameType: cluster.game_type,
      clusterId: cluster.cluster_id,
      healthy: checks.every(c => c.ok),
      checks,
    };
  }

  async clusterAction(clusterId, action) {
    const cluster = await this.getCluster(clusterId);
    if (!cluster) throw new Error(`Cluster ${clusterId} not found`);
    if (!this.serverManager) throw new Error('ServerManager not available');
    const valid = ['start', 'stop', 'restart'];
    if (!valid.includes(action)) throw new Error(`Invalid action: ${action}`);
    const results = [];
    for (const server of cluster.servers) {
      try {
        let r;
        if (action === 'start') r = await this.serverManager.startServer(server.id);
        else if (action === 'stop') r = await this.serverManager.stopServer(server.id);
        else r = await this.serverManager.restartServer(server.id);
        results.push({ serverId: server.id, name: server.name, success: true, result: r });
      } catch (e) {
        results.push({ serverId: server.id, name: server.name, success: false, error: e.message });
      }
      await new Promise(res => setTimeout(res, 1500));
    }
    return results;
  }
}

module.exports = ClusterManager;
