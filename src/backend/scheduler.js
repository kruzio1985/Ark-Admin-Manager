// Copyright (c) 2026 Kruzio
// Licensed under the PolyForm Noncommercial License 1.0.0.
// Non-commercial use only. Commercial use and selling of this code are prohibited.
// https://polyformproject.org/licenses/noncommercial/1.0.0/

/**
 * Ark Admin Manager — Scheduler
 * Cron-like task scheduler dla automatycznych zadań:
 * - Auto-update serwerów
 * - Auto-backup
 * - Auto-restart (z grace period)
 * - Auto-shutdown
 * - Broadcast wiadomości
 * - Wipe dzikich dinosów
 */
const cron = require('node-cron');

class Scheduler {
  constructor(db, serverManager, backupService, rcon) {
    this.db = db;
    this.serverManager = serverManager;
    this.backupService = backupService;
    this.rcon = rcon;
    this.tasks = new Map(); // taskId → cronJob
    this.running = false;
  }

  async start() {
    this.running = true;
    const tasks = this.db.query(
      'SELECT * FROM scheduled_tasks WHERE enabled = 1'
    );

    for (const task of tasks) {
      try {
        this._scheduleTask(task);
      } catch (e) {
        console.error(`[Scheduler] Error scheduling task ${task.id}:`, e.message);
      }
    }

    console.log(`[Scheduler] Started with ${this.tasks.size} active tasks`);
  }

  async stop() {
    this.running = false;
    for (const [id, job] of this.tasks) {
      job.stop();
    }
    this.tasks.clear();
    console.log('[Scheduler] Stopped');
  }

  // ═══════════════════════════════════════════════════════════════════
  // TASK CRUD
  // ═══════════════════════════════════════════════════════════════════

  async listTasks() {
    const tasks = this.db.query('SELECT * FROM scheduled_tasks ORDER BY name');
    for (const task of tasks) {
      const lastLog = this.db.queryOne(
        'SELECT * FROM task_log WHERE task_id = ? ORDER BY created_at DESC LIMIT 1',
        [task.id]
      );
      task.lastRunResult = lastLog;
    }
    return tasks;
  }

  async createTask(taskData) {
    const { name, task_type, server_id, cron_expression, config_json } = taskData;

    // Validate cron expression
    if (!cron.validate(cron_expression)) {
      throw new Error(`Invalid cron expression: ${cron_expression}`);
    }

    this.db.run(
      `INSERT INTO scheduled_tasks (name, task_type, server_id, cron_expression, config_json)
       VALUES (?, ?, ?, ?, ?)`,
      [name, task_type, server_id || null, cron_expression, JSON.stringify(config_json || {})]
    );
    this.db.save();

    const rows = this.db.query('SELECT id FROM scheduled_tasks ORDER BY id DESC LIMIT 1');
    const newId = rows[0]?.id;

    // Schedule immediately
    const task = this.db.queryOne('SELECT * FROM scheduled_tasks WHERE id = ?', [newId]);
    this._scheduleTask(task);

    return task;
  }

  async updateTask(id, taskData) {
    const { name, task_type, server_id, cron_expression, config_json } = taskData;

    if (cron_expression && !cron.validate(cron_expression)) {
      throw new Error(`Invalid cron expression: ${cron_expression}`);
    }

    const sets = [];
    const values = [];
    for (const [k, v] of Object.entries({ name, task_type, server_id, cron_expression })) {
      if (v !== undefined) { sets.push(`${k} = ?`); values.push(v); }
    }
    if (config_json !== undefined) { sets.push('config_json = ?'); values.push(JSON.stringify(config_json)); }

    if (sets.length > 0) {
      this.db.run(`UPDATE scheduled_tasks SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);
      this.db.save();
    }

    // Reschedule
    this._unscheduleTask(id);
    const task = this.db.queryOne('SELECT * FROM scheduled_tasks WHERE id = ?', [id]);
    if (task?.enabled) this._scheduleTask(task);

    return task;
  }

  async deleteTask(id) {
    this._unscheduleTask(id);
    this.db.run('DELETE FROM scheduled_tasks WHERE id = ?', [id]);
    this.db.save();
    return true;
  }

  async enableTask(id) {
    this.db.run('UPDATE scheduled_tasks SET enabled = 1 WHERE id = ?', [id]);
    this.db.save();

    const task = this.db.queryOne('SELECT * FROM scheduled_tasks WHERE id = ?', [id]);
    this._scheduleTask(task);

    return true;
  }

  async disableTask(id) {
    this._unscheduleTask(id);
    this.db.run('UPDATE scheduled_tasks SET enabled = 0 WHERE id = ?', [id]);
    this.db.save();
    return true;
  }

  async runTaskNow(id) {
    const task = this.db.queryOne('SELECT * FROM scheduled_tasks WHERE id = ?', [id]);
    if (!task) throw new Error(`Task ${id} not found`);

    return this._executeTask(task);
  }

  async getTaskLog(taskId) {
    return this.db.query(
      'SELECT * FROM task_log WHERE task_id = ? ORDER BY created_at DESC LIMIT 50',
      [taskId]
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // TASK EXECUTION
  // ═══════════════════════════════════════════════════════════════════

  _scheduleTask(task) {
    if (this.tasks.has(task.id)) return;

    try {
      const job = cron.schedule(task.cron_expression, () => {
        this._executeTask(task);
      });

      this.tasks.set(task.id, job);
      console.log(`[Scheduler] Task "${task.name}" scheduled: ${task.cron_expression}`);
    } catch (e) {
      console.error(`[Scheduler] Failed to schedule task ${task.id}:`, e.message);
    }
  }

  _unscheduleTask(id) {
    const job = this.tasks.get(id);
    if (job) {
      job.stop();
      this.tasks.delete(id);
    }
  }

  async _executeTask(task) {
    const startTime = Date.now();
    let status = 'completed';
    let output = '';

    try {
      const config = task.config_json ? JSON.parse(task.config_json) : {};

      switch (task.task_type) {
        case 'server_update':
          output = await this._execUpdate(task.server_id);
          break;
        case 'server_backup':
          output = await this._execBackup(task.server_id, config);
          break;
        case 'server_restart':
          output = await this._execRestart(task.server_id, config);
          break;
        case 'server_shutdown':
          output = await this._execShutdown(task.server_id, config);
          break;
        case 'server_start':
          output = await this._execStart(task.server_id);
          break;
        case 'broadcast':
          output = await this._execBroadcast(task.server_id, config);
          break;
        case 'dino_wipe':
          output = await this._execDinoWipe(task.server_id);
          break;
        case 'world_save':
          output = await this._execWorldSave(task.server_id);
          break;
        default:
          throw new Error(`Unknown task type: ${task.task_type}`);
      }
    } catch (e) {
      status = 'failed';
      output = e.message;
      console.error(`[Scheduler] Task "${task.name}" failed:`, e.message);
    }

    const duration = Date.now() - startTime;

    // Log to DB
    this.db.run(
      `INSERT INTO task_log (task_id, status, output, duration_ms)
       VALUES (?, ?, ?, ?)`,
      [task.id, status, output, duration]
    );

    // Update last run
    this.db.run(
      "UPDATE scheduled_tasks SET last_run = datetime('now','localtime') WHERE id = ?",
      [task.id]
    );
    this.db.save();

    return { status, output, duration };
  }

  // ── Task Executors ──

  async _execUpdate(serverId) {
    if (!serverId) return 'No server specified';
    await this.serverManager.updateServer(serverId);
    return `Server ${serverId} updated`;
  }

  async _execBackup(serverId, config) {
    if (!serverId) {
      // Backup all servers
      const servers = this.db.query("SELECT id FROM servers WHERE status = 'running'");
      for (const s of servers) {
        await this.backupService.createBackup(s.id, { type: 'scheduled' });
      }
      return `Backed up ${servers.length} servers`;
    }
    await this.backupService.createBackup(serverId, { type: 'scheduled' });
    return `Server ${serverId} backed up`;
  }

  async _execRestart(serverId, config) {
    if (!serverId) return 'No server specified';

    const graceMinutes = config.graceMinutes || 15;
    const messages = config.messages || {};

    // Send grace period messages via RCON
    try {
      const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
      if (server?.rcon_port) {
        const connId = await this.rcon.connect('127.0.0.1', server.rcon_port, server.admin_password || '');
        const msg = messages.grace1 || `Server restart in ${graceMinutes} minutes.`;
        await this.rcon.broadcast(connId, msg);
        this.rcon.disconnect(connId);
      }
    } catch (_) {}

    // Wait, then restart
    await new Promise(r => setTimeout(r, graceMinutes * 60000));
    await this.serverManager.restartServer(serverId);
    return `Server ${serverId} restarted with ${graceMinutes}min grace`;
  }

  async _execShutdown(serverId, config) {
    if (!serverId) return 'No server specified';
    await this.serverManager.stopServer(serverId);
    return `Server ${serverId} shutdown`;
  }

  async _execStart(serverId) {
    if (!serverId) return 'No server specified';
    await this.serverManager.startServer(serverId);
    return `Server ${serverId} started`;
  }

  async _execBroadcast(serverId, config) {
    const message = config.message || 'Server message';
    if (serverId) {
      // Broadcast to specific server via its RCON
      const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
      if (server && server.rcon_port) {
        try {
          const connId = await this.rcon.connect('127.0.0.1', server.rcon_port, server.admin_password || '');
          await this.rcon.broadcast(connId, message);
          this.rcon.disconnect(connId);
        } catch (e) {
          return `RCON broadcast failed: ${e.message}`;
        }
      }
      return `Broadcast sent to server ${serverId}`;
    } else {
      // Broadcast to all running servers
      const servers = this.db.query("SELECT * FROM servers WHERE status = 'running'");
      let count = 0;
      for (const s of servers) {
        try {
          if (s.rcon_port) {
            const connId = await this.rcon.connect('127.0.0.1', s.rcon_port, s.admin_password || '');
            await this.rcon.broadcast(connId, message);
            this.rcon.disconnect(connId);
            count++;
          }
        } catch (_) {}
      }
      return `Broadcast sent to ${count} servers`;
    }
  }

  async _execDinoWipe(serverId) {
    if (!serverId) return 'No server specified';
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (server && server.rcon_port) {
      try {
        const connId = await this.rcon.connect('127.0.0.1', server.rcon_port, server.admin_password || '');
        await this.rcon.broadcast(connId, 'Server is wiping all wild dinos. Please be patient.');
        await this.rcon.sendCommand(connId, 'cheat destroywilddinos');
        this.rcon.disconnect(connId);
      } catch (e) {
        return `Dino wipe failed: ${e.message}`;
      }
    }
    return `Dino wipe executed on server ${serverId}`;
  }

  async _execWorldSave(serverId) {
    if (!serverId) return 'No server specified';
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (server && server.rcon_port) {
      try {
        const connId = await this.rcon.connect('127.0.0.1', server.rcon_port, server.admin_password || '');
        await this.rcon.saveWorld(connId);
        this.rcon.disconnect(connId);
      } catch (e) {
        return `World save failed: ${e.message}`;
      }
    }
    return `World save executed on server ${serverId}`;
  }
}

module.exports = Scheduler;
