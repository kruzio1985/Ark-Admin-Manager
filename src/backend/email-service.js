/**
 * Ark Admin Manager — Email Notification Service
 * SMTP powiadomienia: auto-update, auto-restart, auto-backup, shutdown
 */
const net = require('net');
const tls = require('tls');

class EmailService {
  constructor(db) {
    this.db = db;
  }

  async getConfig() {
    return this.db.queryOne('SELECT * FROM email_config WHERE id = 1');
  }

  async saveConfig(config) {
    const fields = [
      'enabled', 'smtp_host', 'smtp_port', 'smtp_use_ssl',
      'smtp_use_default_credentials', 'smtp_username', 'smtp_password',
      'email_from', 'email_to',
      'notify_update', 'notify_restart', 'notify_backup', 'notify_shutdown'
    ];
    const sets = [];
    const values = [];
    for (const f of fields) {
      if (config[f] !== undefined) { sets.push(`${f} = ?`); values.push(config[f]); }
    }
    if (sets.length > 0) {
      sets.push("updated_at = datetime('now','localtime')");
      this.db.run(`UPDATE email_config SET ${sets.join(', ')} WHERE id = 1`, values);
      this.db.save();
    }
    return this.getConfig();
  }

  async sendNotification(subject, body) {
    const cfg = await this.getConfig();
    if (!cfg || !cfg.enabled || !cfg.smtp_host || !cfg.email_to) {
      return { sent: false, reason: 'Email not configured or disabled' };
    }

    const message = this._buildMessage(cfg.email_from || 'ark@admin.local', cfg.email_to, subject, body);

    try {
      if (cfg.smtp_use_ssl) {
        await this._sendTls(cfg.smtp_host, cfg.smtp_port || 465, message, cfg);
      } else {
        await this._sendPlain(cfg.smtp_host, cfg.smtp_port || 25, message, cfg);
      }
      console.log(`[Email] Sent: "${subject}" to ${cfg.email_to}`);
      return { sent: true };
    } catch (e) {
      console.error('[Email] Send failed:', e.message);
      return { sent: false, reason: e.message };
    }
  }

  // ── Notification helpers ──
  async notifyServerUpdate(serverName, details) {
    const cfg = await this.getConfig();
    if (!cfg?.notify_update) return;
    return this.sendNotification(
      `ARK Server Update: ${serverName}`,
      `Server "${serverName}" has been updated.\n\n${details}\n\n-- ARK Admin Manager`
    );
  }

  async notifyServerRestart(serverName) {
    const cfg = await this.getConfig();
    if (!cfg?.notify_restart) return;
    return this.sendNotification(
      `ARK Server Restart: ${serverName}`,
      `Server "${serverName}" has been restarted.\n\n-- ARK Admin Manager`
    );
  }

  async notifyBackup(serverName, details) {
    const cfg = await this.getConfig();
    if (!cfg?.notify_backup) return;
    return this.sendNotification(
      `ARK Server Backup: ${serverName}`,
      `Backup completed for "${serverName}".\n\n${details}\n\n-- ARK Admin Manager`
    );
  }

  async notifyShutdown(serverName) {
    const cfg = await this.getConfig();
    if (!cfg?.notify_shutdown) return;
    return this.sendNotification(
      `ARK Server Shutdown: ${serverName}`,
      `Server "${serverName}" has been shut down.\n\n-- ARK Admin Manager`
    );
  }

  async notifyError(serverName, error) {
    const cfg = await this.getConfig();
    if (!cfg?.enabled) return;
    return this.sendNotification(
      `ARK Server Error: ${serverName}`,
      `Error on server "${serverName}":\n\n${error}\n\n-- ARK Admin Manager`
    );
  }

  // ── SMTP Implementation ──
  _buildMessage(from, to, subject, body) {
    const lines = [];
    lines.push(`From: ${from}`);
    lines.push(`To: ${to}`);
    lines.push(`Subject: ${subject}`);
    lines.push('MIME-Version: 1.0');
    lines.push('Content-Type: text/plain; charset=utf-8');
    lines.push('Content-Transfer-Encoding: 7bit');
    lines.push('');
    lines.push(body);
    return lines.join('\r\n') + '\r\n.\r\n';
  }

  _sendPlain(host, port, message, cfg) {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let buffer = '';
      const timeout = setTimeout(() => { socket.destroy(); reject(new Error('SMTP timeout')); }, 30000);

      socket.connect(port, host, () => {
        // Wait for greeting, then send HELO
      });

      socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\r\n');

        for (const line of lines) {
          const code = parseInt(line.substring(0, 3));
          if (isNaN(code)) continue;

          if (code === 220) {
            // Greeting received
            socket.write(`HELO ${host}\r\n`);
          } else if (code === 250) {
            if (buffer.includes('HELO') && !buffer.includes('MAIL FROM')) {
              socket.write(`MAIL FROM:<${cfg.email_from || 'ark@admin.local'}>\r\n`);
            } else if (buffer.includes('MAIL FROM') && !buffer.includes('RCPT TO')) {
              socket.write(`RCPT TO:<${cfg.email_to}>\r\n`);
            } else if (buffer.includes('RCPT TO') && !buffer.includes('DATA')) {
              socket.write('DATA\r\n');
            } else if (buffer.includes('QUIT')) {
              clearTimeout(timeout);
              socket.end();
              resolve(true);
            }
            // General ACK — continue
          } else if (code === 354) {
            // Send message
            socket.write(message);
          } else if (code >= 400) {
            socket.write('QUIT\r\n');
            clearTimeout(timeout);
            reject(new Error(`SMTP error: ${line}`));
          }
        }
      });

      socket.on('error', (err) => { clearTimeout(timeout); reject(err); });
      socket.on('close', () => { clearTimeout(timeout); });

      // Timeout for message send
      setTimeout(() => {
        if (socket && !socket.destroyed) {
          socket.write('QUIT\r\n');
        }
      }, 15000);
    });
  }

  _sendTls(host, port, message, cfg) {
    return new Promise((resolve, reject) => {
      const socket = tls.connect({ host, port, rejectUnauthorized: false }, () => {
        // TLS connected
      });

      let buffer = '';
      const timeout = setTimeout(() => { socket.destroy(); reject(new Error('SMTPS timeout')); }, 30000);

      socket.on('data', (data) => {
        buffer += data.toString();
        if (buffer.includes('220')) {
          socket.write(`EHLO ${host}\r\n`);
        } else if (buffer.includes('250') && buffer.includes('EHLO') && !buffer.includes('AUTH')) {
          if (cfg.smtp_username && cfg.smtp_password) {
            const auth = Buffer.from(`\0${cfg.smtp_username}\0${cfg.smtp_password}`).toString('base64');
            socket.write(`AUTH PLAIN ${auth}\r\n`);
          } else {
            socket.write(`MAIL FROM:<${cfg.email_from || 'ark@admin.local'}>\r\n`);
          }
        } else if (buffer.includes('235') || (buffer.includes('250') && buffer.includes('EHLO') && !cfg.smtp_username)) {
          socket.write(`MAIL FROM:<${cfg.email_from || 'ark@admin.local'}>\r\n`);
        } else if (buffer.includes('250') && buffer.includes('MAIL FROM') && !buffer.includes('RCPT TO')) {
          socket.write(`RCPT TO:<${cfg.email_to}>\r\n`);
        } else if (buffer.includes('250') && buffer.includes('RCPT TO') && !buffer.includes('DATA')) {
          socket.write('DATA\r\n');
        } else if (buffer.includes('354')) {
          socket.write(message);
        } else if (buffer.includes('250') && buffer.includes('QUIT')) {
          clearTimeout(timeout);
          socket.end();
          resolve(true);
        }
      });

      socket.on('error', (err) => { clearTimeout(timeout); reject(err); });
      setTimeout(() => { if (!socket.destroyed) socket.write('QUIT\r\n'); }, 15000);
    });
  }
}

module.exports = EmailService;
