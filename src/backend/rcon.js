// Copyright (c) 2026 Kruzio
// Licensed under the PolyForm Noncommercial License 1.0.0.
// Non-commercial use only. Commercial use and selling of this code are prohibited.
// Derivative works must retain this license and link to: https://github.com/kruzio1985/Ark-Admin-Manager
// https://polyformproject.org/licenses/noncommercial/1.0.0/

/**
 * Ark Admin Manager — RCON Module
 * Obsługa RCON dla ARK ASE i ASA (Source RCON Protocol)
 */
const net = require('net');
const { EventEmitter } = require('events');

class RCONConnection extends EventEmitter {
  constructor(host, port, password) {
    super();
    this.host = host;
    this.port = port;
    this.password = password;
    this.socket = null;
    this.requestId = 0;
    this.connected = false;
    this.authenticated = false;
    this.buffer = Buffer.alloc(0);
    this.pendingRequests = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      this.socket.connect(this.port, this.host);

      const timeout = setTimeout(() => {
        this.socket.destroy();
        reject(new Error(`RCON connection timeout to ${this.host}:${this.port}`));
      }, 10000);

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        // Send auth packet
        this._sendPacket(3, this.password); // SERVERDATA_AUTH = 3
      });

      this.socket.on('data', (data) => {
        this.buffer = Buffer.concat([this.buffer, data]);
        this._processBuffer();
      });

      this.socket.on('error', (err) => {
        clearTimeout(timeout);
        this.emit('error', err);
        reject(err);
      });

      this.socket.on('close', () => {
        this.connected = false;
        this.authenticated = false;
        this.emit('disconnect');
      });

      // Handle auth response
      this.once('auth_response', (success) => {
        if (success) {
          this.connected = true;
          this.authenticated = true;
          resolve(true);
        } else {
          this.socket.destroy();
          reject(new Error('RCON authentication failed'));
        }
      });
    });
  }

  async sendCommand(command) {
    return new Promise((resolve, reject) => {
      if (!this.authenticated) {
        return reject(new Error('Not authenticated'));
      }

      const id = ++this.requestId;
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RCON command timeout: ${command}`));
      }, 30000);
      
      this.pendingRequests.set(id, { resolve, reject, timeout });

      // Source RCON: SERVERDATA_EXECCOMMAND = 2
      this._sendPacket(2, command, id);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.destroy();
    }
  }

  // ── Internal RCON Protocol ──
  _sendPacket(type, body, id) {
    const packetId = id !== undefined ? id : this.requestId;
    const bodyBuffer = Buffer.from(body + '\0', 'utf8');
    const size = 4 + 4 + bodyBuffer.length + 1; // RequestID(4) + Type(4) + Body + terminator(1)
    const packet = Buffer.alloc(4 + size); // +4 for size field

    packet.writeInt32LE(size, 0);            // Size
    packet.writeInt32LE(packetId, 4);        // Request ID
    packet.writeInt32LE(type, 8);            // Type
    bodyBuffer.copy(packet, 12);             // Body
    packet.writeInt8(0, 12 + bodyBuffer.length); // Terminator

    if (this.socket && !this.socket.destroyed) {
      this.socket.write(packet);
    }
  }

  _processBuffer() {
    while (this.buffer.length >= 4) {
      const size = this.buffer.readInt32LE(0);
      if (this.buffer.length < 4 + size) break;

      const packet = this.buffer.slice(4, 4 + size);
      this.buffer = this.buffer.slice(4 + size);

      const id = packet.readInt32LE(0);
      const type = packet.readInt32LE(4);
      const body = packet.slice(8, packet.length - 2).toString('utf8').trim();

      // Source RCON: type 2 = auth response, type 0 = command response
      // ARK may use either type for auth — handle both
      
      if (!this.authenticated) {
        // Still waiting for auth — accept any type as auth response
        this.emit('auth_response', id !== -1);
        continue;
      }

      // Authenticated — handle command responses
      if (type === 0 || type === 2) {
        const pending = this.pendingRequests.get(id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(id);
          pending.resolve(body);
        }
      }
    }
  }
}

class RCON {
  constructor(db) {
    this.db = db;
    this.connections = new Map(); // connId → RCONConnection
    this.nextConnId = 1;
  }

  async connect(host, port, password) {
    const connId = this.nextConnId++;
    const conn = new RCONConnection(host, port, password);
    
    // Forward events
    conn.on('disconnect', () => {
      this.connections.delete(connId);
    });
    conn.on('error', (err) => {
      console.error(`[RCON] Connection ${connId} error:`, err.message);
    });

    await conn.connect();
    this.connections.set(connId, conn);
    console.log(`[RCON] Connected to ${host}:${port} (id=${connId})`);
    return connId;
  }

  disconnect(connId) {
    const conn = this.connections.get(connId);
    if (conn) {
      conn.disconnect();
      this.connections.delete(connId);
    }
  }

  async sendCommand(connId, command) {
    const conn = this.connections.get(connId);
    if (!conn) throw new Error(`RCON connection ${connId} not found`);
    return conn.sendCommand(command);
  }

  async getPlayers(connId) {
    const raw = await this.sendCommand(connId, 'ListPlayers');
    return this._parsePlayerList(raw);
  }

  async broadcast(connId, message) {
    return this.sendCommand(connId, `admincheat Broadcast ${message}`);
  }

  async saveWorld(connId) {
    return this.sendCommand(connId, 'admincheat SaveWorld');
  }

  async getServerInfo(connId) {
    const raw = await this.sendCommand(connId, 'getgamelog');
    const version = await this.sendCommand(connId, 'serverchangelist');
    return { gamelog: raw, version };
  }

  // ── Advanced RCON commands ──
  async serverChat(connId, message) {
    return this.sendCommand(connId, `serverchat ${message}`);
  }

  async kickPlayer(connId, steamId, reason) {
    return this.sendCommand(connId, `kickplayer ${steamId} ${reason || ''}`);
  }

  async banPlayer(connId, steamId, reason) {
    return this.sendCommand(connId, `banplayer ${steamId} ${reason || ''}`);
  }

  async unbanPlayer(connId, steamId) {
    return this.sendCommand(connId, `unbanplayer ${steamId}`);
  }

  async whitelistAdd(connId, steamId) {
    return this.sendCommand(connId, `AllowPlayerToJoinNoCheck ${steamId}`);
  }

  async whitelistRemove(connId, steamId) {
    return this.sendCommand(connId, `DisallowPlayerToJoinNoCheck ${steamId}`);
  }

  async destroyWildDinos(connId) {
    return this.sendCommand(connId, 'cheat destroywilddinos');
  }

  async giveItem(connId, playerId, blueprint, amount, quality, forceBlueprint) {
    // blueprint to PEŁNA ścieżka (Blueprint'...'), trzeba w cudzysłowach (zawiera apostrofy)
    // ARK obcina giveitemtoplayer do max stacku (100) — dzielimy na porcje po 100
    const total = Math.max(1, parseInt(amount, 10) || 1);
    const results = [];
    let left = total;
    while (left > 0) {
      const qty = Math.min(100, left);
      const cmd = `giveitemtoplayer ${playerId} "${blueprint}" ${qty} ${quality} ${forceBlueprint ? 1 : 0}`;
      console.log(`[RCON] giveItem => ${cmd}`);
      results.push(await this.sendCommand(connId, cmd));
      left -= qty;
    }
    return results.length === 1 ? results[0] : results.join(' | ');
  }

  async teleportPlayer(connId, steamId, x, y, z) {
    return this.sendCommand(connId, `teleportplayeridto ${steamId} ${x} ${y} ${z}`);
  }

  async getChat(connId) {
    return this.sendCommand(connId, 'getchat');
  }

  // ── Helpers ──
  _parsePlayerList(raw) {
    const players = [];
    // Format: "0. PlayerName, STEAMID\n1. PlayerName2, STEAMID2"
    const lines = raw.split('\n');
    for (const line of lines) {
      const match = line.match(/^(\d+)\.\s+(.+?),\s*(\d+)$/);
      if (match) {
        players.push({
          playerId: match[1].trim(),
          name: match[2].trim(),
          steamId: match[3].trim(),
        });
      }
    }
    return players;
  }
}

module.exports = RCON;
