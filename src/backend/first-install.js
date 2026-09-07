/**
 * Ark Admin Manager — First-Install Automation
 * Sprawdza i instaluje wymagane składniki: SteamCMD, DirectX June2010, VC++ redist.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const os = require('os');

const PREREQS = {
  steamcmd: { name: 'SteamCMD', detail: 'steamcmd.exe w folderze SteamCMD (D:\\steamcmd)' },
  directx: { name: 'DirectX June2010', detail: 'X3DAudio1_7.dll / XAPOFX1_5.dll — wymagane przez ASE' },
  vc2013: { name: 'Visual C++ 2013 Redist', detail: 'msvcr120.dll — wymagane przez ASE' },
  vc2022: { name: 'Visual C++ 2015-2022 Redist', detail: 'vcruntime140.dll — wymagane przez ASE/ASA' },
};

const DOWNLOAD_URLS = {
  directx: 'https://download.microsoft.com/download/1/7/1/1718CCC4-6315-4D8E-9543-8E28A4E18C4C/dxwebsetup.exe',
  vc2013: 'https://download.microsoft.com/download/0/5/6/056dcda9-d667-4e27-8001-8a0c6971d6b1/vcredist_x64.exe',
  vc2022: 'https://aka.ms/vs/17/release/vc_redist.x64.exe',
};

class FirstInstall {
  constructor(steamcmd, db) {
    this.steamcmd = steamcmd;
    this.db = db;
  }

  _dllExists(name) {
    const windir = process.env.WINDIR || 'C:\\Windows';
    for (const d of [path.join(windir, 'System32'), path.join(windir, 'SysWOW64')]) {
      try { if (fs.existsSync(path.join(d, name))) return true; } catch (_) {}
    }
    return false;
  }

  async check() {
    const state = {
      steamcmd: await this.steamcmd.checkInstalled(),
      directx: this._dllExists('X3DAudio1_7.dll') || this._dllExists('XAPOFX1_5.dll'),
      vc2013: this._dllExists('msvcr120.dll'),
      vc2022: this._dllExists('vcruntime140.dll'),
    };
    return Object.entries(PREREQS).map(([id, info]) => ({
      id, name: info.name, detail: info.detail, installed: !!state[id],
    }));
  }

  _download(url, dest, redirects = 0) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      const req = https.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirects > 5) { file.close(); return reject(new Error('Too many redirects')); }
          file.close();
          return resolve(this._download(new URL(res.headers.location, url).href, dest, redirects + 1));
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      });
      req.on('error', (e) => { try { fs.unlinkSync(dest); } catch (_) {} reject(e); });
      req.setTimeout(300000, () => { req.destroy(); reject(new Error('Download timeout')); });
    });
  }

  async install(id) {
    if (id === 'steamcmd') {
      await this.steamcmd.installSteamCMD();
      return { success: true, message: 'SteamCMD zainstalowany' };
    }
    const url = DOWNLOAD_URLS[id];
    if (!url) throw new Error(`Nieznany składnik: ${id}`);
    const tmp = path.join(os.tmpdir(), 'ark_first_install');
    fs.mkdirSync(tmp, { recursive: true });
    const dest = path.join(tmp, id + '.exe');
    await this._download(url, dest);
    const args = id === 'directx' ? ['/Q'] : ['/install', '/quiet', '/norestart'];
    return new Promise((resolve, reject) => {
      const child = spawn(dest, args, { detached: true, stdio: 'ignore', windowsHide: true });
      child.on('error', reject);
      child.on('close', (code) => resolve({
        success: true,
        message: `${PREREQS[id].name} — instalator uruchomiony (exit ${code})`,
      }));
      setTimeout(() => child.unref(), 2000);
    });
  }
}

module.exports = FirstInstall;
