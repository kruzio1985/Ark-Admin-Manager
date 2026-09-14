// Copyright (c) 2026 Kruzio
// Licensed under the PolyForm Noncommercial License 1.0.0.
// Non-commercial use only. Commercial use and selling of this code are prohibited.
// https://polyformproject.org/licenses/noncommercial/1.0.0/

/**
 * Ark Admin Manager — SteamCMD Module
 * Zarządza SteamCMD: instalacja, update, pobieranie serwerów ASE i ASA
 */
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

class SteamCMD {
  constructor(steamDir, db) {
    this.steamDir = steamDir;
    this.db = db;
    this.steamcmdExe = path.join(steamDir, 'steamcmd.exe');
    this.cacheDir = null;
  }

  // ── SteamCMD Installation ──
  async checkInstalled() {
    return fs.existsSync(this.steamcmdExe);
  }

  async installSteamCMD() {
    if (!fs.existsSync(this.steamDir)) {
      fs.mkdirSync(this.steamDir, { recursive: true });
    }

    const url = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip';
    const zipPath = path.join(this.steamDir, 'steamcmd.zip');

    console.log('[SteamCMD] Downloading steamcmd...');
    await this._downloadFile(url, zipPath);

    console.log('[SteamCMD] Extracting...');
    await this._extractZip(zipPath, this.steamDir);

    // First run to update
    await this._runSteamCmd(['+quit'], { timeout: 120000 });
    console.log('[SteamCMD] Installed successfully');
    return true;
  }

  async updateSteamCMD() {
    console.log('[SteamCMD] Updating...');
    await this._runSteamCmd(['+quit'], { timeout: 120000 });
    return true;
  }

  // ── Server Installation ──
  /**
   * ASE App IDs:
   *   376030 - ARK: Survival Evolved Dedicated Server
   * ASE Mods: Steam Workshop
   * 
   * ASA App IDs:
   *   2430930 - ARK: Survival Ascended Dedicated Server
   * ASA Mods: CurseForge (different system)
   */
  getAppId(gameType) {
    return gameType === 'ASA' ? '2430930' : '376030';
  }

  async installServer(gameType, installPath, onProgress) {
    const appId = this.getAppId(gameType);
    const cmdArgs = [
      '+force_install_dir', installPath,
      '+login', 'anonymous',
      '+app_update', appId, 'validate',
      '+quit'
    ];

    console.log(`[SteamCMD] Installing ${gameType} server (AppID: ${appId})...`);
    await this._runSteamCmd(cmdArgs, { 
      timeout: 3600000, // 1 hour for big downloads
      onOutput: (line) => {
        if (onProgress && line.includes('Progress')) {
          onProgress(line);
        }
      }
    });

    console.log(`[SteamCMD] ${gameType} server installed to ${installPath}`);
    return true;
  }

  async updateServer(gameType, installPath, onProgress) {
    const appId = this.getAppId(gameType);
    const cmdArgs = [
      '+force_install_dir', installPath,
      '+login', 'anonymous',
      '+app_update', appId, 'validate',
      '+quit'
    ];

    console.log(`[SteamCMD] Updating ${gameType} server...`);
    await this._runSteamCmd(cmdArgs, { 
      timeout: 3600000,
      onOutput: (line) => {
        if (onProgress && line.includes('Progress')) {
          onProgress(line);
        }
      }
    });

    return true;
  }

  // ── Mod Installation (ASE: Steam Workshop) ──
  async installModsASE(installPath, modIds, onProgress) {
    if (!modIds || modIds.length === 0) return true;

    const cmdArgs = [
      '+force_install_dir', installPath,
      '+login', 'anonymous'
    ];

    for (const modId of modIds) {
      cmdArgs.push('+workshop_download_item', '346110', String(modId), 'validate');
    }
    cmdArgs.push('+quit');

    console.log(`[SteamCMD] Installing ${modIds.length} ASE mods...`);
    await this._runSteamCmd(cmdArgs, { timeout: 1800000 });

    // Mod pobrany do cache workshop. Właściwą instalację do Content\Mods
    // (folder + poprawny binarny .mod) zrobi SAM SERWER po restarcie dzięki
    // fladze -automanagedmods + [ModInstaller] ModIDS= w Game.ini.
    console.log(`[SteamCMD] Mods downloaded to workshop cache: ${modIds.join(', ')}`);

    return true;
  }

  // ── Internal Methods ──
  _runSteamCmd(args, options = {}) {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 300000;
      let output = '';
      let timer;

      // Check if steamcmd exists BEFORE spawning
      if (!fs.existsSync(this.steamcmdExe)) {
        return reject(new Error(`SteamCMD not found at: ${this.steamcmdExe}. Run "Install SteamCMD" first from Settings.`));
      }

      console.log(`[SteamCMD] Running: ${this.steamcmdExe} ${args.join(' ')}`);
      console.log(`[SteamCMD] Working dir: ${this.steamDir}`);

      const proc = spawn(this.steamcmdExe, args, {
        cwd: this.steamDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log(`[SteamCMD OUT] ${text.trim()}`);
        if (options.onOutput) options.onOutput(text);
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log(`[SteamCMD ERR] ${text.trim()}`);
        if (options.onOutput) options.onOutput(text);
      });

      timer = setTimeout(() => {
        console.log(`[SteamCMD] TIMEOUT after ${timeout}ms, killing process`);
        proc.kill();
        reject(new Error(`SteamCMD timeout after ${Math.round(timeout/60000)} minutes. The download may still be in progress. Check C:\\steamcmd\\logs.`));
      }, timeout);

      proc.on('close', (code) => {
        clearTimeout(timer);
        console.log(`[SteamCMD] Process exited with code ${code}`);
        if (code === 0 || options.ignoreExitCode) {
          resolve(output);
        } else {
          const errMsg = output.slice(-500) || '(no output)';
          console.error(`[SteamCMD] FAILED. Last output: ${errMsg}`);
          reject(new Error(`SteamCMD exited with code ${code}. Check logs. Last output: ${errMsg}`));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        console.error(`[SteamCMD] SPAWN ERROR: ${err.message}`);
        reject(new Error(`Cannot start SteamCMD: ${err.message}. Is it installed at ${this.steamDir}?`));
      });
    });
  }

  async _downloadFile(url, destPath) {
    console.log(`[SteamCMD] Downloading: ${url} → ${destPath}`);
    const http = url.startsWith('https') ? require('https') : require('http');
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      http.get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          try { fs.unlinkSync(destPath); } catch (_) {}
          console.log(`[SteamCMD] Redirect to: ${response.headers.location}`);
          return this._downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        }
        if (response.statusCode >= 400) {
          file.close();
          try { fs.unlinkSync(destPath); } catch (_) {}
          return reject(new Error(`HTTP ${response.statusCode} downloading ${url}`));
        }
        response.pipe(file);
        file.on('finish', () => { file.close(); console.log(`[SteamCMD] Download complete`); resolve(); });
      }).on('error', (err) => {
        try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (_) {}
        console.error(`[SteamCMD] Download error: ${err.message}`);
        reject(new Error(`Download failed: ${err.message}`));
      });
    });
  }

  async _extractZip(zipPath, destDir) {
    const extract = require('extract-zip');
    await extract(zipPath, { dir: destDir });
    fs.unlinkSync(zipPath);
  }

  _copyDirSync(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this._copyDirSync(s, d);
      } else {
        fs.copyFileSync(s, d);
      }
    }
  }
}

module.exports = SteamCMD;
