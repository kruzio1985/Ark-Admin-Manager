# 🦖 ARK Admin Manager

**Kompleksowy menedżer serwerów ARK: Survival Evolved (ASE) i ARK: Survival Ascended (ASA)**
*Comprehensive server manager for ARK: Survival Evolved (ASE) & ARK: Survival Ascended (ASA)*

> 📖 **Pełna dokumentacja (PL + EN) / Full documentation (PL + EN):** [DOCUMENTATION.md](DOCUMENTATION.md) · [CHANGELOG.md](CHANGELOG.md)

| | |
|---|---|
| Wersja / Version | 1.0.28 |
| Data build / Build date | 2026-09-07 |
| Autor / Author | Kruzio |
| Licencja / License | MIT |
| Framework | Electron 33.x + Node.js 20.x |
| Instalator | electron-builder 25 (NSIS + Portable) |
| Baza danych | SQLite (sql.js — WASM) |
| Język UI | PL/ENG (przełącznik w górnym pasku) |

---

## 📖 Opis projektu

ARK Admin Manager to aplikacja desktopowa (Electron) do zarządzania dedykowanymi serwerami ARK na Windows. Obsługuje **obie generacje gry**:

- **ASE** — ARK: Survival Evolved (AppID `376030`, Steam Workshop, `ShooterGameServer.exe`)
- **ASA** — ARK: Survival Ascended (AppID `2430930`, CurseForge, `ArkAscendedServer.exe`)

Projekt powstał jako nowoczesna, ulepszona reimplementacja klasycznego **ARK Server Manager (ASM)** — referencyjnego narzędzia .NET, które znajduje się w `PROJEKTY_W_BUDOWIE\ARK sources`. Wszystkie funkcje ASM mają być odtworzone i rozszerzone.

## 📸 Screenshots / Zrzuty ekranu

<div align="center">
  <a href="images/a1.png"><img src="images/a1.png" alt="ARK Admin Manager - screenshot 1" width="30%" /></a>
  <a href="images/a2.png"><img src="images/a2.png" alt="ARK Admin Manager - screenshot 2" width="30%" /></a>
  <a href="images/a3.png"><img src="images/a3.png" alt="ARK Admin Manager - screenshot 3" width="30%" /></a>
  <a href="images/a4.png"><img src="images/a4.png" alt="ARK Admin Manager - screenshot 4" width="30%" /></a>
  <a href="images/a5.png"><img src="images/a5.png" alt="ARK Admin Manager - screenshot 5" width="30%" /></a>
  <a href="images/a6.png"><img src="images/a6.png" alt="ARK Admin Manager - screenshot 6" width="30%" /></a>
  <a href="images/a7.png"><img src="images/a7.png" alt="ARK Admin Manager - screenshot 7" width="30%" /></a>
  <a href="images/a8.png"><img src="images/a8.png" alt="ARK Admin Manager - screenshot 8" width="30%" /></a>
  <a href="images/a9.png"><img src="images/a9.png" alt="ARK Admin Manager - screenshot 9" width="30%" /></a>
  <a href="images/a10.png"><img src="images/a10.png" alt="ARK Admin Manager - screenshot 10" width="30%" /></a>
  <a href="images/a11.png"><img src="images/a11.png" alt="ARK Admin Manager - screenshot 11" width="30%" /></a>
  <a href="images/a12.png"><img src="images/a12.png" alt="ARK Admin Manager - screenshot 12" width="30%" /></a>
  <a href="images/a13.png"><img src="images/a13.png" alt="ARK Admin Manager - screenshot 13" width="30%" /></a>
</div>

Kliknij obraz, aby powiększyć / Click an image to enlarge.

---

## 🏗️ Architektura

```
ArkAdminManager/
├── main.js                  # Electron main — ładuje backendy BEZPOŚREDNIO + IPC handlers
├── preload.js               # contextBridge → window.api.invoke / window.api.on
├── dev-server.js            # Express (port 3000) — TYLKO tryb dev (npm run dev)
├── version.json             # Manifest wersji i lista funkcji
├── package.json             # Build config (electron-builder)
│
├── assets/                  # Ikony (icon.ico)
├── data/                    # Dane startowe kopiowane do AppData przy 1. uruchomieniu
│   ├── ark_admin.db         # Pusta baza SQLite (schema)
│   ├── gamedata/            # 12 plików *.gamedata map ASE (TheIsland…Fjordur)
│   └── templates/           # Szablony
│
└── src/
    ├── games/
    │   └── game-registry.js # Definicje ASE + ASA (mapy, porty, AppID, sekcje INI)
    ├── backend/             # 14 modułów backendowych
    │   ├── database.js
    │   ├── server-manager.js
    │   ├── steamcmd.js
    │   ├── rcon.js
    │   ├── config-parser.js
    │   ├── config-descriptions.js
    │   ├── mod-manager.js
    │   ├── cluster-manager.js
    │   ├── backup-service.js
    │   ├── scheduler.js
    │   ├── discord-bot.js
    │   ├── email-service.js
    │   ├── system-monitor.js
    │   └── firewall-manager.js
    └── ui/
        ├── index.html       # Całe UI: 2208 linii, 19 paneli
        └── css/main.css     # Style (ciemny motyw)
```

### Przepływ danych
```
index.html (fetch→IPC bridge) ──► window.api.invoke(channel, ...args)
        ──► preload.js (contextBridge) ──► ipcMain.handle(...) w main.js
        ──► moduł backendu ──► SQLite (sql.js) / SteamCMD / RCON / system
```

### Katalogi runtime
```
%APPDATA%\ArkAdminManager\
├── ark_admin.db        # baza (kopiowana z data/ przy 1. uruchomieniu)
├── logs\               # startup.log (crash logger)
├── backups\            # backupy serwerów
├── gamedata\           # dane map
└── templates\          # szablony
```

**SteamCMD i serwery — konfigurowalne w panelu Settings (domyślnie):**
```
D:\steamcmd          # SteamCMD (AppID 376030/2430930)
D:\                  # katalog serwerów — każdy serwer w OSOBNYM folderze
D:\arkevolvedserver  # ARK: Survival Evolved
D:\scumserver        # SCUM (inna gra — ignorowane przez ARK Admin)
D:\duneserver        # Dune (NIE ruszane przez aplikację)
```

> SteamCMD i serwery mogą być na **RÓŻNYCH dyskach** — SteamCMD instaluje pliki serwera do `Install Path` (`+force_install_dir`), niezależnie od swojej lokalizacji.

---

## 🎮 Obsługiwane gry

| | ASE (Survival Evolved) | ASA (Survival Ascended) |
|---|---|---|
| Steam AppID | `376030` | `2430930` |
| Exe | `ShooterGameServer.exe` | `ArkAscendedServer.exe` |
| Mod system | Steam Workshop (`346110`) | CurseForge |
| Port domyślny (baza) | 7790 (UDP) | 7850 (UDP) |
| Query port (baza) | 27017 (UDP) | 27050 (UDP) |
| RCON port (baza) | 32330 (TCP) | 32400 (TCP) |
| Ścieżka configu | `ShooterGame/Saved/Config/WindowsServer` | j.w. |

> ⚠️ **Porty dobrane tak, aby NIE kolidować z innymi grami:**
> - Dune Awakening: 7777 UDP game, 27015/27016 UDP query, 7778–7787 UDP multi-sietch, 8080/3000/3001 TCP
> - SCUM: 7042/7043 · Rust: 28015–28017

### 🔌 Porty per-mapa (edytowalne, NIE hardkodowane)

Każda mapa ma własny domyślny zestaw portów, zdefiniowany w **`data/port-presets.json`** (edytowalny plik konfiguracyjny — zmieniaj ręcznie na własne potrzeby; przy publikacji na GitHub można nadać inne wartości).

- ASE: `7790–7801` game, `27017–27028` query, `32330–32341` RCON
- ASA: `7850–7855` game, `27050–27055` query, `32400–32405` RCON

W formularzu tworzenia serwera pola portów **auto-wypełniają się** po wyborze gry i mapy — i pozostają **w pełni edytowalne**.

**Mapy ASE:** The Island, The Center, Scorched Earth, Ragnarok, Aberration, Extinction, Valguero, Genesis, Crystal Isles, Genesis 2, Lost Island, Fjordur.

**Mapy ASA:** The Island, Scorched Earth, The Center, Aberration, Extinction, Club ARK.

---

## 🧩 Funkcje (19 paneli)

| Panel | Funkcje |
|---|---|
| 📊 Dashboard | Przegląd serwerów, statusy, szybkie akcje |
| 🖥 Servers | CRUD + **Start / Stop / Restart / Install / Update / Validate** + **🔍 Detect Servers** (auto-wykrywanie istniejących serwerów na D:\) |
| 🔗 Clusters | Klastry cross-ARK, sync configu, walidacja |
| ⚙ Config Editor | Pełny edytor `Game.ini` + `GameUserSettings.ini` — tryb INI MERGE (nie nadpisuje całego pliku) |
| 📝 Server Details | Szczegóły, status, gracze, uptime |
| 👥 Player Manager | Zarządzanie graczami (whitelist/ban) |
| 📦 Mod Manager | Instalacja/usuwanie/aktualizacja modów (ASE Workshop) |
| 💻 RCON Console | Uniwersalny RCON (Source RCON protocol) — komendy, broadcast, save, gracze |
| 💾 Backups | Backupy ZIP serwerów, przywracanie, harmonogram |
| ⏰ Scheduler | Zadania cron (update/backup/restart/shutdown/start/broadcast/dino wipe/save) |
| 📜 Console | Podgląd logów serwera (`ShooterGame/Saved/Logs`) |
| 📈 System | CPU/RAM/Dysk/Sieć + historia |
| 💬 Discord Bot | Bot Discord.js v14, konfigurowalne kanały (1-3) |
| 📧 Email | Powiadomienia e-mail |
| 🛡 Firewall & Network | Windows Firewall (netsh), auto IP publiczne, reguły portów |
| 🔄 Profile Sync | Synchronizacja konfiguracji między serwerami |
| ⬆ Auto-Update | Automatyczne aktualizacje serwerów |
| 📁 Server Files | Przeglądarka i edytor plików serwera |
| 🔧 Settings | Ustawienia globalne (SteamCMD, ścieżki) |

### Backend — 14 modułów
`database.js` (SQLite/sql.js) · `server-manager.js` (cykl życia + monitor statusu) · `steamcmd.js` (instalacja/update SteamCMD + serwery) · `rcon.js` (Source RCON) · `config-parser.js` (INI merge + sekcje ASM) · `config-descriptions.js` (opisy opcji) · `mod-manager.js` · `cluster-manager.js` · `backup-service.js` · `scheduler.js` · `discord-bot.js` · `email-service.js` · `system-monitor.js` · `firewall-manager.js`

---

## 🚀 Uruchamianie i build

### Szybka instalacja / Quick install

Gotowy instalator znajduje się w osobnym folderze [`installer/`](installer/):

- **`installer/ARK Admin Manager Setup 1.0.28.exe`** — instalator NSIS (x64)

Pobierz i uruchom plik `.exe` — instalator zainstaluje aplikację per-machine
(wymaga uprawnień administratora) i utworzy skróty na pulpicie oraz w menu Start.
Wersję portable budujesz komendą `npm run build:portable` (szczegóły niżej).

### Wymagania
- Node.js 20.x + npm
- Windows (aplikacja zarządza serwerami Windows)

### Dev
```powershell
cd C:\Projects\OfflineWorkspace\PROJEKTY\PROJEKTY_W_BUDOWIE\ArkAdminManager
npm install
npm run dev        # Express na http://localhost:3000 + Electron
# lub
npm start          # Electron bezpośrednio (loadFile index.html)
```

### Build instalatora
```powershell
npm run build:installer   # NSIS (x64) + Portable (x64)
```

**Wynik build** (zgodnie z `build.directories.output`):
```
C:\Projects\OfflineWorkspace\PROJEKTY\PROJEKTY_W_BUDOWIE\Ark_admin_Manager_instalator_1.0.28\
├── ARK Admin Manager Setup 1.0.28.exe   # instalator NSIS
├── ARK Admin Manager 1.0.28.exe         # wersja portable
├── ARK Admin Manager Setup 1.0.28.exe.blockmap
├── builder-debug.yml
├── builder-effective-config.yaml
└── win-unpacked\                       # rozpakowana wersja do testów
```

> ⚠️ **Ważne:** nowe wersje buduj zawsze z folderu projektu — output trafia do `Ark_admin_Manager_instalator_<wersja>` (wersjonowany folder, np. `_1.0.28`). Przy zmianie wersji podbij `version` w `package.json` i `version.json`. Buduj przez `npm.cmd run build:installer`.

### Konfiguracja instalatora (package.json → build)
- `appId`: `com.arkadmin.manager`
- `productName`: `ARK Admin Manager`
- `win.target`: NSIS + Portable (x64)
- `requestedExecutionLevel`: `highestAvailable` (uruchamianie jako administrator)
- `nsis.perMachine`: `true` (instalacja dla wszystkich użytkowników → Program Files)
- `nsis.allowToChangeInstallationDirectory`: `true` (domyślnie Program Files)
- `extraResources`: kopiuje `data/` do zasobów aplikacji

---

## 🌐 Sieć i dostęp zdalny (IP:port)

Aplikacja jest **natywną aplikacją desktopową** (Electron), więc domyślnie działa lokalnie na maszynie, na której jest zainstalowana.

**Plan instalacji na serwerze (Windows):**
1. Zainstaluj `ARK Admin Manager Setup 1.0.28.exe` na serwerze (Windows).
2. Uruchom jako administrator.
3. Zarządzaj serwerami ASE/ASA lokalnie na serwerze.

**Dostęp zdalny w sieci LAN** — opcje:
- **RDP** — podłącz się do serwera przez Pulpit zdalny i używaj aplikacji tak, jak lokalnie.
- **Web UI (zaimplementowane)** — wbudowany serwer Express w `main.js` na porcie **8090** (0.0.0.0). Dostęp przez przeglądarkę: `http://IP_SERWERA:8090`. Pełne REST API: `POST /api/invoke` z `{channel, args}` + `GET /api/health`. Port zmienisz w Settings → Remote Access.

### Porty do otwarcia w zaporze (serwer)
| Port | Protokół | Cel |
|---|---|---|
| 7790 | UDP | Port gry ARK |
| 27017 | UDP | Query port |
| 32330 | TCP | RCON |
| 3000 | TCP | (opcjonalnie) Web UI |

Panel **Firewall & Network** automatyzuje dodawanie reguł dla portów gry/query/RCON.

---

## 🔍 Wykrywanie serwerów na dysku D

**✅ Auto-detekcja (przycisk „🔍 Detect Servers” w panelu Servers):**
- Skanuje `D:\` (oraz `C:\ARK`, `C:\ark`, `C:\Servers`) w poszukiwaniu folderów zawierających exe serwera ARK.
- Wykrywa ASE (`ShooterGameServer.exe`) i ASA (`ArkAscendedServer.exe`).
- **READ-ONLY** — nic nie modyfikuje na dysku, tylko dodaje serwery do bazy aplikacji.
- **Automatycznie pomija** foldery nie-ARK (`duneserver`, `scumserver`, `backup`, `Narzędzia` itp.) — nie mają one plików `ShooterGame\Binaries\Win64\*.exe`.

**Wykrywanie działających procesów:** `tasklist` (`ShooterGameServer.exe` / `ArkAscendedServer.exe`) — `syncLiveStatus()` przy starcie i co 30 s.

Struktura folderu serwera wymagana przez aplikację:
```
<folder>\ShooterGame\Binaries\Win64\ShooterGameServer.exe   (ASE)
<folder>\ShooterGame\Binaries\Win64\ArkAscendedServer.exe   (ASA)
<folder>\ShooterGame\Saved\Config\WindowsServer\Game.ini
<folder>\ShooterGame\Saved\Config\WindowsServer\GameUserSettings.ini
```

---

## ⚙️ Format startu serwera (launch args)

`_buildLaunchArgs()` buduje argument w formacie ARK:
```
TheIsland?listen?Port=7790?QueryPort=27017?RCONPort=32330?RCONEnabled=True?SessionName=xxx -server -log
```
- ASA: mapy z sufiksem `_WP` (np. `TheIsland_WP`), `-WinLiveMaxPlayers=`, `-ClusterIdOverride=`.
- ASE: `RCONEnabled=True`, `ClusterDirOverride=`.
- Uruchamianie przez **dwa pliki BAT** (sprawdzone rozwiązanie): BAT menedżera otwiera BAT serwera w osobnym oknie `cmd /k` — okno pozostaje otwarte po zatrzymaniu.

---

## 📦 Moduły i zależności

| Zależność | Cel |
|---|---|
| `sql.js` | SQLite w WASM |
| `discord.js` | Bot Discord |
| `express` | Dev server |
| `ini` | Parsowanie INI |
| `node-cron` | Harmonogramy |
| `systeminformation` | Monitoring systemu |
| `portfinder` | Wyszukiwanie wolnych portów |
| `extract-zip` | Rozpakowywanie (SteamCMD) |
| `ws` | WebSocket |

Dev: `electron`, `electron-builder`.

---

## 📜 Historia prac i naprawione błędy

Pełna historia rozwoju znajduje się w **historii sesji Copilot** (sesja `74cc03da-8652-4771-b95d-7ea88e71200f`, 52 tury). Kluczowe kamienie milowe:

1. ✅ Analiza referencyjnego ASM (`.NET`, `ARK sources`) + repo GitHub
2. ✅ Instalator NSIS + Portable (fix: dwa pliki, launch po instalacji, Program Files)
3. ✅ Uruchamianie jako administrator (`highestAvailable`)
4. ✅ Działające linki zewnętrzne (`shell:openExternal`)
5. ✅ Tworzenie serwera → uruchomienie SteamCMD (instalacja na dysku)
6. ✅ Funkcja Update (fix: błąd `AppID:` w BAT — dwukropek interpretowany jako dysk)
7. ✅ RCON (Source RCON protocol) + konsola serwera (odczyt `Saved/Logs`)
8. ✅ Discord Bot — konfigurowalne kanały (1–3)
9. ✅ Firewall & Network — reguły netsh + auto public IP
10. ✅ Config Editor — widok listy, kategorie, opisy opcji
11. ✅ Fix: `UNIQUE constraint failed: server_messages.server_id`
12. ✅ Fix: pole nazwy serwera wyszarzone
13. ✅ **Start serwera** — fix: exit code 0 → podejście z dwoma BAT (finalnie działa)

---

## 🗂️ Dokumentacja pokrewnych projektów

- `PROJEKTY_W_BUDOWIE\ARK sources` — referencyjny ASM (.NET, skompilowany, bez README)
- `PROJEKTY_W_BUDOWIE\Multi_Admin_Manager` — menedżer 51 gier (wzór architektury)
- `PROJEKTY_W_BUDOWIE\ScumAdminManager` — SCUM Admin Manager (wzór instalatora SteamCMD)
- `BACKUPS\Multi_Admin_Manager_full_2026-07-01_0219\PROJECT_README.md`
- `BACKUPS\ScumAdminManager_backup_*\README.md`, `DISCORD_SETUP.md`

---

## ✅ Status / TODO

**Działa:** CRUD serwerów, start/stop/restart, instalacja/update/validate (SteamCMD), config editor (INI merge), RCON, backupy, scheduler, monitoring, Discord, firewall, gamedata.

**Do rozbudowy:**
- [ ] Auto-skanowanie dysku D w poszukiwaniu istniejących serwerów ASE/ASA
- [ ] Web UI przez `http://IP_SERWERA:3000` (mapowanie IPC → REST + auth)
- [ ] Mod Manager ASA (CurseForge — obecnie tylko ASE Workshop)
- [ ] Pełne odwzorowanie wszystkich opcji ASM (cel projektu)
