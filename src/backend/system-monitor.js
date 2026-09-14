// Copyright (c) 2026 Kruzio
// Licensed under the PolyForm Noncommercial License 1.0.0.
// Non-commercial use only. Commercial use and selling of this code are prohibited.
// Derivative works must retain this license and link to: https://github.com/kruzio1985/Ark-Admin-Manager
// https://polyformproject.org/licenses/noncommercial/1.0.0/

/**
 * Ark Admin Manager — System Monitor
 * Monitoruje CPU, RAM, dysk, sieć — dane systemowe
 */
const os = require('os');
const fs = require('fs');
const path = require('path');

class SystemMonitor {
  constructor() {
    this.history = [];
    this.maxHistory = 1000;
    this.interval = null;
    this.previousCpu = null;
    this.previousNetwork = null;
  }

  // ═══════════════════════════════════════════════════════════════════
  // SYSTEM INFO
  // ═══════════════════════════════════════════════════════════════════

  async getSystemInfo() {
    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      cpus: os.cpus().length,
      totalMem: os.totalmem(),
      freeMem: os.freemem(),
      uptime: os.uptime(),
      nodeVersion: process.version,
      electronVersion: process.versions.electron || 'N/A',
    };
  }

  async getCpuUsage() {
    const cpus = os.cpus();
    let totalIdle = 0, totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }

    let usage = 0;
    if (this.previousCpu) {
      const idleDelta = totalIdle - this.previousCpu.idle;
      const tickDelta = totalTick - this.previousCpu.tick;
      usage = tickDelta > 0 ? 100 - (idleDelta / tickDelta * 100) : 0;
    }

    this.previousCpu = { idle: totalIdle, tick: totalTick };

    return {
      usagePercent: Math.round(usage * 10) / 10,
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown',
      speed: cpus[0]?.speed || 0,
    };
  }

  async getMemoryUsage() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    return {
      totalGb: +(total / 1024 / 1024 / 1024).toFixed(2),
      usedGb: +(used / 1024 / 1024 / 1024).toFixed(2),
      freeGb: +(free / 1024 / 1024 / 1024).toFixed(2),
      usagePercent: Math.round((used / total) * 1000) / 10,
    };
  }

  async getDiskInfo() {
    try {
      // Check the drive where the app is running
      const drive = process.cwd().split(path.sep)[0] + '\\';
      
      // Try using systeminformation if available, otherwise fallback
      let total = 0, free = 0, used = 0;

      try {
        const si = require('systeminformation');
        const fsSize = await si.fsSize();
        const mainDisk = fsSize.find(d => d.mount === drive);
        if (mainDisk) {
          total = mainDisk.size;
          free = mainDisk.available;
          used = mainDisk.used;
        }
      } catch (_) {
        // Fallback: rough estimate
        total = 500 * 1024 * 1024 * 1024; // assume 500GB
        free = 100 * 1024 * 1024 * 1024;
        used = total - free;
      }

      return {
        totalGb: +(total / 1024 / 1024 / 1024).toFixed(2),
        usedGb: +(used / 1024 / 1024 / 1024).toFixed(2),
        freeGb: +(free / 1024 / 1024 / 1024).toFixed(2),
        usagePercent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
        drive,
      };
    } catch (e) {
      return { totalGb: 0, usedGb: 0, freeGb: 0, usagePercent: 0, drive: 'N/A', error: e.message };
    }
  }

  async getNetworkInfo() {
    try {
      let currentBytes = { rx: 0, tx: 0 };
      let speed = { down: 0, up: 0 };

      try {
        const si = require('systeminformation');
        const stats = await si.networkStats();
        if (stats && stats.length > 0) {
          const main = stats[0];
          currentBytes = { rx: main.rx_bytes, tx: main.tx_bytes };

          if (this.previousNetwork) {
            const timeDiff = (Date.now() - this.previousNetwork.time) / 1000;
            speed.down = timeDiff > 0 ? (main.rx_bytes - this.previousNetwork.rx) / timeDiff : 0;
            speed.up = timeDiff > 0 ? (main.tx_bytes - this.previousNetwork.tx) / timeDiff : 0;
          }
        }
      } catch (_) {}

      this.previousNetwork = { ...currentBytes, time: Date.now() };

      return {
        downBps: speed.down,
        upBps: speed.up,
        downMbps: +(speed.down / 1024 / 1024).toFixed(2),
        upMbps: +(speed.up / 1024 / 1024).toFixed(2),
      };
    } catch (e) {
      return { downBps: 0, upBps: 0, downMbps: 0, upMbps: 0, error: e.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // HISTORY
  // ═══════════════════════════════════════════════════════════════════

  async getHistory(period = '1h') {
    const now = Date.now();
    let cutoff;

    switch (period) {
      case '10m': cutoff = now - 10 * 60 * 1000; break;
      case '1h': cutoff = now - 60 * 60 * 1000; break;
      case '6h': cutoff = now - 6 * 60 * 60 * 1000; break;
      case '24h': cutoff = now - 24 * 60 * 60 * 1000; break;
      default: cutoff = now - 60 * 60 * 1000;
    }

    return this.history.filter(h => h.timestamp >= cutoff);
  }

  // ═══════════════════════════════════════════════════════════════════
  // AUTO-COLLECTION (call periodically)
  // ═══════════════════════════════════════════════════════════════════

  async collectMetrics(db) {
    try {
      const [cpu, mem, disk, net] = await Promise.all([
        this.getCpuUsage(),
        this.getMemoryUsage(),
        this.getDiskInfo(),
        this.getNetworkInfo(),
      ]);

      const metric = {
        timestamp: Date.now(),
        cpuPercent: cpu.usagePercent,
        ramPercent: mem.usagePercent,
        ramUsedGb: mem.usedGb,
        ramTotalGb: mem.totalGb,
        diskPercent: disk.usagePercent,
        diskUsedGb: disk.usedGb,
        diskTotalGb: disk.totalGb,
        networkUpBps: net.upBps,
        networkDownBps: net.downBps,
      };

      this.history.push(metric);
      if (this.history.length > this.maxHistory) {
        this.history = this.history.slice(-this.maxHistory);
      }

      // Save to DB every 5 minutes
      if (db && this.history.length % 5 === 0) {
        db.run(
          `INSERT INTO system_metrics (cpu_percent, ram_percent, ram_used_gb, ram_total_gb, disk_percent, disk_used_gb, disk_total_gb, network_up_bps, network_down_bps)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [metric.cpuPercent, metric.ramPercent, metric.ramUsedGb, metric.ramTotalGb,
           metric.diskPercent, metric.diskUsedGb, metric.diskTotalGb,
           metric.networkUpBps, metric.networkDownBps]
        );
        db.save();
      }

      return metric;
    } catch (e) {
      console.error('[SystemMonitor] Error collecting metrics:', e.message);
      return null;
    }
  }

  startAutoCollect(db, intervalMs = 60000) {
    if (this.interval) return;
    this.interval = setInterval(() => this.collectMetrics(db), intervalMs);
    console.log(`[SystemMonitor] Auto-collect started (${intervalMs}ms interval)`);
  }

  stopAutoCollect() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

module.exports = SystemMonitor;
