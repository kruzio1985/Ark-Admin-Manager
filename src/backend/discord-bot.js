// Copyright (c) 2026 Kruzio
// Licensed under the PolyForm Noncommercial License 1.0.0.
// Non-commercial use only. Commercial use and selling of this code are prohibited.
// https://polyformproject.org/licenses/noncommercial/1.0.0/

/**
 * Ark Admin Manager — Discord Bot
 * Integracja Discord: komendy, powiadomienia, cross-chat
 * 
 * Komendy (prefix: ark!):
 *   ark!status - Status wszystkich serwerów
 *   ark!players [server] - Lista graczy
 *   ark!start <server> - Uruchom serwer
 *   ark!stop <server> - Zatrzymaj serwer
 *   ark!restart <server> - Restart serwera
 *   ark!update <server> - Aktualizuj serwer
 *   ark!backup [server] - Backup serwera
 *   ark!broadcast <msg> - Wyślij wiadomość do graczy
 *   ark!help - Pomoc
 */
const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder } = require('discord.js');

class DiscordBot {
  constructor(db, serverManager, rcon) {
    this.db = db;
    this.serverManager = serverManager;
    this.rcon = rcon;
    this.client = null;
    this.running = false;
    this._chatSeen = new Map();      // serverId -> Set(ostatnie linie chatu)
    this._crossChatInterval = null;
  }

  async getConfig() {
    return this.db.queryOne('SELECT * FROM discord_config WHERE id = 1');
  }

  async saveConfig(config) {
    const fields = [
      'enabled', 'token', 'client_id', 'guild_id', 'prefix',
      'channel_status', 'channel_console', 'channel_chat', 'channel_alerts',
      'channel_players', 'channel_adminlog',
      'allow_backup', 'allow_update', 'allow_start', 'allow_restart',
      'allow_shutdown', 'allow_stop', 'log_level', 'cross_chat_enabled'
    ];
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
      this.db.run(`UPDATE discord_config SET ${sets.join(', ')} WHERE id = 1`, values);
      this.db.save();
    }

    return this.getConfig();
  }

  async start() {
    const config = await this.getConfig();
    if (!config || !config.enabled || !config.token) {
      console.log('[Discord] Bot not configured or disabled');
      return false;
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
    });

    this.client.once('ready', () => {
      this.running = true;
      console.log(`[Discord] Logged in as ${this.client.user.tag}`);
      this._sendAlert('🟢 **ARK Admin Manager** is now online.');
      this._startCrossChat();
    });

    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      await this._handleCommand(message);
      await this._handleCrossChatFromDiscord(message);
    });

    // Error handling
    this.client.on('error', (err) => {
      console.error('[Discord] Client error:', err.message);
    });

    this.client.on('disconnect', () => {
      this.running = false;
      console.log('[Discord] Disconnected');
    });

    try {
      await this.client.login(config.token);
      return true;
    } catch (e) {
      console.error('[Discord] Login failed:', e.message);
      this.running = false;
      return false;
    }
  }

  async stop() {
    if (this._crossChatInterval) { clearInterval(this._crossChatInterval); this._crossChatInterval = null; }
    if (this.client) {
      try {
        await this._sendAlert('🔴 **ARK Admin Manager** is shutting down.');
        this.client.destroy();
      } catch (_) {}
      this.client = null;
    }
    this.running = false;
    console.log('[Discord] Bot stopped');
  }

  getStatus() {
    return {
      running: this.running,
      username: this.client?.user?.tag || null,
      guilds: this.client?.guilds?.cache?.size || 0,
    };
  }

  getLog() {
    return { running: this.running, status: this.client ? 'connected' : 'disconnected' };
  }

  // ═══════════════════════════════════════════════════════════════════
  // CROSS-CHAT (gra ↔ Discord)
  // ═══════════════════════════════════════════════════════════════════

  _startCrossChat() {
    if (this._crossChatInterval) clearInterval(this._crossChatInterval);
    this._crossChatInterval = setInterval(() => {
      this._pollCrossChat().catch(() => {});
    }, 5000);
    if (this._crossChatInterval.unref) this._crossChatInterval.unref();
  }

  async _pollCrossChat() {
    const config = await this.getConfig();
    if (!config?.cross_chat_enabled || !config.channel_chat) return;
    const servers = this.db.query("SELECT * FROM servers WHERE status = 'running' AND admin_password IS NOT NULL");
    const channel = this.client.channels.cache.get(config.channel_chat);
    if (!channel) return;
    for (const s of servers) {
      try {
        let connId = this.serverManager.rconConnections?.get(s.id);
        let own = false;
        if (!connId) {
          connId = await this.rcon.connect('127.0.0.1', s.rcon_port, s.admin_password);
          own = true;
        }
        const raw = await this.rcon.getChat(connId);
        if (own) this.rcon.disconnect(connId);
        const lines = String(raw || '').split('\n').map(l => l.trim()).filter(Boolean);
        if (!lines.length) continue;
        const seen = this._chatSeen.get(s.id) || new Set();
        const fresh = lines.filter(l => !seen.has(l));
        for (const l of fresh) {
          await channel.send(`🎮 **${s.name}**: ${l}`).catch(() => {});
        }
        for (const l of lines) seen.add(l);
        if (seen.size > 500) {
          const arr = [...seen]; seen.clear(); arr.slice(-200).forEach(x => seen.add(x));
        }
        this._chatSeen.set(s.id, seen);
      } catch (_) {}
    }
  }

  async _handleCrossChatFromDiscord(message) {
    const config = await this.getConfig();
    if (!config?.cross_chat_enabled || !config.channel_chat) return;
    if (message.channel.id !== config.channel_chat) return;
    const prefix = config.prefix || 'ark!';
    if (message.content.startsWith(prefix)) return; // to komenda, nie chat
    const text = message.content;
    if (!text) return;
    const servers = this.db.query("SELECT * FROM servers WHERE status = 'running' AND admin_password IS NOT NULL");
    for (const s of servers) {
      try {
        const connId = await this.rcon.connect('127.0.0.1', s.rcon_port, s.admin_password || '');
        await this.rcon.serverChat(connId, `[Discord ${message.author.username}] ${text}`);
        this.rcon.disconnect(connId);
      } catch (_) {}
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // COMMAND HANDLER
  // ═══════════════════════════════════════════════════════════════════

  async _handleCommand(message) {
    const config = await this.getConfig();
    const prefix = config?.prefix || 'ark!';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    try {
      switch (command) {
        case 'help':
          await this._cmdHelp(message, prefix);
          break;
        case 'status':
          await this._cmdStatus(message);
          break;
        case 'players':
          await this._cmdPlayers(message, args);
          break;
        case 'start':
          await this._cmdAction(message, args, 'start', config.allow_start);
          break;
        case 'stop':
          await this._cmdAction(message, args, 'stop', config.allow_stop);
          break;
        case 'restart':
          await this._cmdAction(message, args, 'restart', config.allow_restart);
          break;
        case 'update':
          await this._cmdAction(message, args, 'update', config.allow_update);
          break;
        case 'backup':
          await this._cmdBackup(message, args, config.allow_backup);
          break;
        case 'broadcast':
          await this._cmdBroadcast(message, args);
          break;
        case 'list':
          await this._cmdList(message);
          break;
      }
    } catch (e) {
      await message.reply(`❌ Error: ${e.message}`);
    }
  }

  async _cmdHelp(message, prefix) {
    const embed = new EmbedBuilder()
      .setTitle('🦖 ARK Admin Manager — Commands')
      .setColor(0x00AE86)
      .setDescription(`Prefix: \`${prefix}\``)
      .addFields(
        { name: '`status`', value: 'Show all server statuses', inline: true },
        { name: '`list`', value: 'List all configured servers', inline: true },
        { name: '`players [name]`', value: 'List players on server(s)', inline: true },
        { name: '`start <name>`', value: 'Start a server', inline: true },
        { name: '`stop <name>`', value: 'Stop a server', inline: true },
        { name: '`restart <name>`', value: 'Restart a server', inline: true },
        { name: '`update <name>`', value: 'Update server files', inline: true },
        { name: '`backup [name]`', value: 'Backup server(s)', inline: true },
        { name: '`broadcast <msg>`', value: 'Broadcast to all servers', inline: true },
      );
    await message.reply({ embeds: [embed] });
  }

  async _cmdStatus(message) {
    const servers = this.db.query('SELECT * FROM servers ORDER BY name');
    if (servers.length === 0) {
      return message.reply('No servers configured.');
    }

    const embed = new EmbedBuilder()
      .setTitle('📊 Server Status')
      .setColor(0x3498DB);

    let description = '';
    for (const s of servers) {
      const emoji = s.status === 'running' ? '🟢' : s.status === 'stopping' ? '🟡' : '🔴';
      description += `${emoji} **${s.name}** — ${s.map_name} (${s.game_type}) — Port: ${s.port}\n`;
    }

    embed.setDescription(description);
    await message.reply({ embeds: [embed] });
  }

  async _cmdPlayers(message, args) {
    const servers = this.db.query('SELECT * FROM servers');
    const serverName = args[0];

    for (const s of servers) {
      if (serverName && !s.name.toLowerCase().includes(serverName.toLowerCase())) continue;

      try {
        const status = await this.serverManager.getServerStatus(s.id);
        if (status.rconConnected) {
          const players = await this.rcon.getPlayers(status.rconConnected);
          const playerList = players.length > 0
            ? players.map(p => `• ${p.name} (${p.steamId})`).join('\n')
            : 'No players online';
          await message.reply(`**${s.name}** (${players.length} players):\n${playerList}`);
        } else {
          await message.reply(`**${s.name}**: ${s.status === 'running' ? 'Running (RCON not connected)' : 'Offline'}`);
        }
      } catch (_) {
        await message.reply(`**${s.name}**: Status unavailable`);
      }
    }
  }

  async _cmdAction(message, args, action, allowed) {
    if (!allowed) return message.reply(`❌ \`${action}\` command is disabled.`);

    const serverName = args.join(' ');
    if (!serverName) return message.reply(`❌ Usage: \`${action} <server name>\``);

    const server = this._findServer(serverName);
    if (!server) return message.reply(`❌ Server "${serverName}" not found.`);

    await message.reply(`⏳ Executing \`${action}\` on **${server.name}**...`);

    switch (action) {
      case 'start': await this.serverManager.startServer(server.id); break;
      case 'stop': await this.serverManager.stopServer(server.id); break;
      case 'restart': await this.serverManager.restartServer(server.id); break;
      case 'update': await this.serverManager.updateServer(server.id); break;
    }

    await message.channel.send(`✅ \`${action}\` completed on **${server.name}**`);
  }

  async _cmdBackup(message, args, allowed) {
    if (!allowed) return message.reply('❌ Backup command is disabled.');

    const serverName = args.join(' ');
    if (serverName) {
      const server = this._findServer(serverName);
      if (!server) return message.reply(`❌ Server "${serverName}" not found.`);
      await message.reply(`⏳ Creating backup for **${server.name}**...`);
      const result = await this._getBackupService().createBackup(server.id, { type: 'discord' });
      await message.channel.send(`✅ Backup created: ${(result.sizeBytes / 1024 / 1024).toFixed(2)} MB`);
    } else {
      await message.reply('⏳ Creating backups for all servers...');
      const servers = this.db.query("SELECT * FROM servers WHERE status = 'running'");
      for (const s of servers) {
        await this._getBackupService().createBackup(s.id, { type: 'discord' });
      }
      await message.channel.send(`✅ Backups created for ${servers.length} servers`);
    }
  }

  async _cmdBroadcast(message, args) {
    const msg = args.join(' ');
    if (!msg) return message.reply('❌ Usage: `broadcast <message>`');

    const servers = this.db.query("SELECT * FROM servers WHERE status = 'running'");
    let count = 0;
    for (const s of servers) {
      try {
        if (s.rcon_port) {
          const connId = await this.rcon.connect('127.0.0.1', s.rcon_port, s.admin_password || '');
          await this.rcon.broadcast(connId, `[Discord] ${msg}`);
          this.rcon.disconnect(connId);
          count++;
        }
      } catch (_) {}
    }
    await message.reply(`✅ Broadcast sent to ${count} servers`);
  }

  async _cmdList(message) {
    const servers = this.db.query('SELECT * FROM servers ORDER BY name');
    if (servers.length === 0) return message.reply('No servers configured.');

    const list = servers.map(s =>
      `• **${s.name}** — ${s.game_type} — ${s.map_name} — Port: ${s.port} — ${s.status}`
    ).join('\n');
    await message.reply(`**Configured Servers:**\n${list}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // CHANNEL HELPERS — supports global + per-server channels
  // ═══════════════════════════════════════════════════════════════════

  async _sendToChannel(channelId, msg) {
    if (!channelId || !this.client) return;
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel) await channel.send(msg);
    } catch (_) {}
  }

  async _getServerChannel(serverId, channelType) {
    // First check per-server config
    const sc = this.db.queryOne(
      'SELECT * FROM discord_server_channels WHERE server_id = ?', [serverId]
    );
    if (sc && sc[channelType]) return sc[channelType];

    // Fallback to global config
    const cfg = await this.getConfig();
    const globalMap = {
      'channel_console': cfg?.channel_console,
      'channel_chat': cfg?.channel_chat,
      'channel_alerts': cfg?.channel_alerts,
      'channel_players': cfg?.channel_players,
    };
    return globalMap[channelType] || null;
  }

  async _sendAlert(msg, serverId) {
    try {
      const config = await this.getConfig();
      
      // Send to global alerts channel
      if (config?.channel_alerts) {
        await this._sendToChannel(config.channel_alerts, msg);
      }
      
      // Send to per-server alerts channel if configured
      if (serverId) {
        const sc = this.db.queryOne(
          'SELECT channel_alerts FROM discord_server_channels WHERE server_id = ?', [serverId]
        );
        if (sc?.channel_alerts && sc.channel_alerts !== config?.channel_alerts) {
          await this._sendToChannel(sc.channel_alerts, msg);
        }
      }
    } catch (_) {}
  }

  async _sendConsole(serverId, msg) {
    const channelId = await this._getServerChannel(serverId, 'channel_console');
    await this._sendToChannel(channelId, msg);
  }

  async _sendPlayers(serverId, msg) {
    const channelId = await this._getServerChannel(serverId, 'channel_players');
    await this._sendToChannel(channelId, msg);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PER-SERVER CHANNEL CONFIG (called from IPC)
  // ═══════════════════════════════════════════════════════════════════

  async getServerChannels(serverId) {
    return this.db.queryOne(
      'SELECT * FROM discord_server_channels WHERE server_id = ?', [serverId]
    );
  }

  async saveServerChannels(serverId, channels) {
    const existing = this.db.queryOne(
      'SELECT id FROM discord_server_channels WHERE server_id = ?', [serverId]
    );
    
    if (existing) {
      const fields = ['channel_console', 'channel_chat', 'channel_alerts', 'channel_players', 'cross_chat_enabled'];
      const sets = [];
      const values = [];
      for (const f of fields) {
        if (channels[f] !== undefined) { sets.push(`${f} = ?`); values.push(channels[f]); }
      }
      if (sets.length) {
        this.db.run(`UPDATE discord_server_channels SET ${sets.join(', ')} WHERE server_id = ?`, [...values, serverId]);
      }
    } else {
      this.db.run(
        `INSERT INTO discord_server_channels (server_id, channel_console, channel_chat, channel_alerts, channel_players, cross_chat_enabled)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [serverId, channels.channel_console || '', channels.channel_chat || '', 
         channels.channel_alerts || '', channels.channel_players || '', channels.cross_chat_enabled || 0]
      );
    }
    this.db.save();
    return this.getServerChannels(serverId);
  }

  // ═══════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════

  _findServer(name) {
    const servers = this.db.query('SELECT * FROM servers');
    const lower = name.toLowerCase();
    return servers.find(s =>
      s.name.toLowerCase().includes(lower) ||
      String(s.id) === name
    );
  }

  _getBackupService() {
    return new (require('./backup-service.js'))(this.db, '');
  }

  _getBackupService() {
    return new (require('./backup-service.js'))(this.db, '');
  }
}

module.exports = DiscordBot;
