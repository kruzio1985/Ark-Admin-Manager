# ARK Admin Manager — Full Documentation / Pełna dokumentacja

**Version / Wersja:** 1.0.28 · **Author / Autor:** Kruzio · **License / Licencja:** MIT
**Language / Język:** English below · Polski poniżej

---

# PART I — ENGLISH

## 1. Overview

**ARK Admin Manager** is a Windows desktop application (Electron) for managing dedicated
**ARK: Survival Evolved (ASE)** and **ARK: Survival Ascended (ASA)** servers.

- **ASE** — AppID `376030`, Steam Workshop, `ShooterGameServer.exe`
- **ASA** — AppID `2430930`, CurseForge, `ArkAscendedServer.exe`

It is a modern, extended reimplementation of the classic **ARK Server Manager (ASM)** —
server lifecycle, configuration, RCON, mods, backups, monitoring, Discord and more.

| | |
|---|---|
| Framework | Electron 33.x + Node.js 20.x |
| Installer | electron-builder 25 (NSIS + Portable) |
| Database | SQLite (sql.js — WASM) |
| UI language | PL / EN |
| License | MIT |

## 2. Features (19 panels)

| Panel | Purpose |
|---|---|
| 📊 Dashboard | Server overview, status, quick actions |
| 🖥 Servers | CRUD + Start / Stop / Restart / Install / Update / Validate + auto-detect existing servers |
| 🔗 Clusters | Cross-ARK clusters, config sync, validation |
| ⚙ Config Editor | Full `Game.ini` + `GameUserSettings.ini` editor (INI MERGE mode) |
| 📝 Server Details | Details, status, players, uptime |
| 👥 Player Manager | Player management (whitelist / ban / admin) |
| 📦 Mod Manager | Install / remove / update mods (ASE Workshop) |
| 💻 RCON Console | Source RCON protocol — commands, broadcast, save, players |
| 💾 Backups | Server ZIP backups, restore, schedule |
| ⏰ Scheduler | Cron tasks (update / backup / restart / shutdown / start / broadcast / dino wipe / save) |
| 📜 Console | Server log viewer (`ShooterGame/Saved/Logs`) |
| 📈 System | CPU / RAM / disk / network + history |
| 💬 Discord Bot | Discord.js v14 bot, 1–3 configurable channels |
| 📧 Email | Email notifications |
| 🛡 Firewall & Network | Windows Firewall (netsh), auto public IP, port rules |
| 🔄 Profile Sync | Config sync between servers |
| ⬆ Auto-Update | Automatic server updates |
| 📁 Server Files | Server file browser and editor |
| 🔧 Settings | Global settings (SteamCMD, paths) |

### Backend modules (14)
`database` · `server-manager` · `steamcmd` · `rcon` · `config-parser` · `config-descriptions` ·
`mod-manager` · `cluster-manager` · `backup-service` · `scheduler` · `discord-bot` ·
`email-service` · `system-monitor` · `firewall-manager`

## 3. Architecture

```
ArkAdminManager/
├── main.js          # Electron main — loads backends + IPC handlers
├── preload.js       # contextBridge → window.api.invoke / window.api.on
├── dev-server.js    # Express (port 3000) — dev mode only
├── version.json     # Version manifest
├── package.json     # Build config (electron-builder)
├── assets/          # Icons
├── data/            # Initial data (copied to AppData on first run)
│   ├── gamedata/    # ARK map data
│   ├── templates/   # Templates
│   └── port-presets.json
└── src/
    ├── games/       # game-registry.js — ASE + ASA definitions
    ├── backend/     # 14 backend modules
    └── ui/          # index.html (whole UI) + css
```

### Data flow
```
index.html → window.api.invoke(channel, ...args)
  → preload.js (contextBridge)
  → ipcMain.handle(...) in main.js
  → backend module
  → SQLite / SteamCMD / RCON / system
```

### Runtime directories
```
%APPDATA%\ArkAdminManager\
├── ark_admin.db   # database (copied from data/ on first run)
├── logs\          # startup.log
├── backups\       # server backups
├── gamedata\      # map data
└── templates\     # templates
```

## 4. Supported games & ports

| | ASE | ASA |
|---|---|---|
| Steam AppID | `376030` | `2430930` |
| Executable | `ShooterGameServer.exe` | `ArkAscendedServer.exe` |
| Mod system | Steam Workshop (`346110`) | CurseForge |
| Game port (base) | 7790 UDP | 7850 UDP |
| Query port (base) | 27017 UDP | 27050 UDP |
| RCON port (base) | 32330 TCP | 32400 TCP |

Ports are **per-map and fully editable** — defined in `data/port-presets.json`.

**ASE maps:** The Island, The Center, Scorched Earth, Ragnarok, Aberration, Extinction,
Valguero, Genesis, Crystal Isles, Genesis 2, Lost Island, Fjordur.

**ASA maps:** The Island, Scorched Earth, The Center, Aberration, Extinction, Club ARK.

## 5. Requirements & build

### Requirements
- Windows (the app manages Windows servers)
- Node.js 20.x + npm

### Development
```powershell
npm install
npm run dev    # Express on http://localhost:3000 + Electron
npm start      # Electron directly
```

### Build installer
```powershell
npm run build:installer   # NSIS (x64) + Portable (x64)
```

The output lands in `../Ark_admin_Manager_instalator_<version>`:
```
Ark_admin_Manager_instalator_1.0.28\
├── ARK Admin Manager Setup 1.0.28.exe   # NSIS installer
├── ARK Admin Manager 1.0.28.exe         # portable
└── win-unpacked\                        # unpacked build
```

## 6. Server start format

```
TheIsland?listen?Port=7790?QueryPort=27017?RCONPort=32330?RCONEnabled=True?SessionName=xxx -server -log
```
- **ASA:** maps with `_WP` suffix (e.g. `TheIsland_WP`), `-WinLiveMaxPlayers=`, `-ClusterIdOverride=`.
- **ASE:** `RCONEnabled=True`, `ClusterDirOverride=`.
- Servers are started through **two BAT files** — the manager BAT opens the server BAT in a separate `cmd /k` window.

## 7. RCON & Give Item

RCON uses the **Source RCON protocol** (`src/backend/rcon.js`).

- **Give item:** `giveitemtoplayer <ARKID> "<BlueprintPath>" <qty> <quality> <forceBP>`
  - The PlayerID **must be the ARK PlayerDataID**, not the `ListPlayers` index.
  - Quantity is split into chunks of 100 (ARK stack cap).
  - Each command uses a **fresh RCON connection** (no stale sockets).
- Player ID is resolved from `<install>\ShooterGame\Saved\SavedArks\<STEAMID>.arkprofile`.

## 8. Mods (ASE)

Installing mods uses the correct ARK method:
- `-automanagedmods` launch flag
- `[ModInstaller] ModIDS=<id>` in `Game.ini`
- `ActiveMods=<ids>` in `GameUserSettings.ini` → `[ServerSettings]`

The server downloads and creates the proper binary `.mod` files automatically.

## 9. Security notes

- **No secrets are stored in source code.** Admin passwords, server passwords and tokens
  are stored at runtime in the SQLite database (`%APPDATA%\ArkAdminManager\ark_admin.db`).
- `*.db`, `*.sqlite` and `*.log` are excluded from the repository (see `.gitignore`).
- Do not commit `sdkconfig`, local diagnostic scripts or runtime databases.

## 10. Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

---

# CZĘŚĆ II — POLSKI

## 1. Opis

**ARK Admin Manager** to aplikacja desktopowa (Electron) dla systemu Windows do zarządzania
dedykowanymi serwerami **ARK: Survival Evolved (ASE)** i **ARK: Survival Ascended (ASA)**.

- **ASE** — AppID `376030`, Steam Workshop, `ShooterGameServer.exe`
- **ASA** — AppID `2430930`, CurseForge, `ArkAscendedServer.exe`

To nowoczesna, rozszerzona reimplementacja klasycznego **ARK Server Manager (ASM)** —
cykl życia serwera, konfiguracja, RCON, mody, backupy, monitoring, Discord i więcej.

| | |
|---|---|
| Framework | Electron 33.x + Node.js 20.x |
| Instalator | electron-builder 25 (NSIS + Portable) |
| Baza danych | SQLite (sql.js — WASM) |
| Język UI | PL / EN |
| Licencja | MIT |

## 2. Funkcje (19 paneli)

| Panel | Funkcje |
|---|---|
| 📊 Dashboard | Przegląd serwerów, statusy, szybkie akcje |
| 🖥 Servers | CRUD + Start / Stop / Restart / Install / Update / Validate + auto-wykrywanie serwerów |
| 🔗 Clusters | Klastry cross-ARK, sync configu, walidacja |
| ⚙ Config Editor | Pełny edytor `Game.ini` + `GameUserSettings.ini` (tryb INI MERGE) |
| 📝 Server Details | Szczegóły, status, gracze, uptime |
| 👥 Player Manager | Zarządzanie graczami (whitelist / ban / admin) |
| 📦 Mod Manager | Instalacja / usuwanie / aktualizacja modów (ASE Workshop) |
| 💻 RCON Console | Protokół Source RCON — komendy, broadcast, save, gracze |
| 💾 Backups | Backupy ZIP serwerów, przywracanie, harmonogram |
| ⏰ Scheduler | Zadania cron (update / backup / restart / shutdown / start / broadcast / dino wipe / save) |
| 📜 Console | Podgląd logów serwera (`ShooterGame/Saved/Logs`) |
| 📈 System | CPU / RAM / dysk / sieć + historia |
| 💬 Discord Bot | Bot Discord.js v14, 1–3 kanały |
| 📧 Email | Powiadomienia e-mail |
| 🛡 Firewall & Network | Zapora Windows (netsh), auto public IP, reguły portów |
| 🔄 Profile Sync | Synchronizacja konfiguracji między serwerami |
| ⬆ Auto-Update | Automatyczne aktualizacje serwerów |
| 📁 Server Files | Przeglądarka i edytor plików serwera |
| 🔧 Settings | Ustawienia globalne (SteamCMD, ścieżki) |

### Backend — 14 modułów
`database` · `server-manager` · `steamcmd` · `rcon` · `config-parser` · `config-descriptions` ·
`mod-manager` · `cluster-manager` · `backup-service` · `scheduler` · `discord-bot` ·
`email-service` · `system-monitor` · `firewall-manager`

## 3. Architektura

```
ArkAdminManager/
├── main.js          # Electron main — ładuje backendy + IPC handlers
├── preload.js       # contextBridge → window.api.invoke / window.api.on
├── dev-server.js    # Express (port 3000) — tylko tryb dev
├── version.json     # Manifest wersji
├── package.json     # Konfiguracja build (electron-builder)
├── assets/          # Ikony
├── data/            # Dane startowe (kopiowane do AppData przy 1. uruchomieniu)
│   ├── gamedata/    # Dane map ARK
│   ├── templates/   # Szablony
│   └── port-presets.json
└── src/
    ├── games/       # game-registry.js — definicje ASE + ASA
    ├── backend/     # 14 modułów backendowych
    └── ui/          # index.html (całe UI) + css
```

### Przepływ danych
```
index.html → window.api.invoke(channel, ...args)
  → preload.js (contextBridge)
  → ipcMain.handle(...) w main.js
  → moduł backendu
  → SQLite / SteamCMD / RCON / system
```

### Katalogi runtime
```
%APPDATA%\ArkAdminManager\
├── ark_admin.db   # baza (kopiowana z data/ przy 1. uruchomieniu)
├── logs\          # startup.log
├── backups\       # backupy serwerów
├── gamedata\      # dane map
└── templates\     # szablony
```

## 4. Obsługiwane gry i porty

| | ASE | ASA |
|---|---|---|
| Steam AppID | `376030` | `2430930` |
| Plik exe | `ShooterGameServer.exe` | `ArkAscendedServer.exe` |
| System modów | Steam Workshop (`346110`) | CurseForge |
| Port gry (baza) | 7790 UDP | 7850 UDP |
| Query port (baza) | 27017 UDP | 27050 UDP |
| RCON port (baza) | 32330 TCP | 32400 TCP |

Porty są **per-mapa i w pełni edytowalne** — zdefiniowane w `data/port-presets.json`.

**Mapy ASE:** The Island, The Center, Scorched Earth, Ragnarok, Aberration, Extinction,
Valguero, Genesis, Crystal Isles, Genesis 2, Lost Island, Fjordur.

**Mapy ASA:** The Island, Scorched Earth, The Center, Aberration, Extinction, Club ARK.

## 5. Wymagania i budowanie

### Wymagania
- Windows (aplikacja zarządza serwerami Windows)
- Node.js 20.x + npm

### Tryb deweloperski
```powershell
npm install
npm run dev    # Express na http://localhost:3000 + Electron
npm start      # Electron bezpośrednio
```

### Budowanie instalatora
```powershell
npm run build:installer   # NSIS (x64) + Portable (x64)
```

Wynik trafia do `../Ark_admin_Manager_instalator_<wersja>`:
```
Ark_admin_Manager_instalator_1.0.28\
├── ARK Admin Manager Setup 1.0.28.exe   # instalator NSIS
├── ARK Admin Manager 1.0.28.exe         # wersja portable
└── win-unpacked\                        # rozpakowana wersja
```

## 6. Format startu serwera

```
TheIsland?listen?Port=7790?QueryPort=27017?RCONPort=32330?RCONEnabled=True?SessionName=xxx -server -log
```
- **ASA:** mapy z sufiksem `_WP` (np. `TheIsland_WP`), `-WinLiveMaxPlayers=`, `-ClusterIdOverride=`.
- **ASE:** `RCONEnabled=True`, `ClusterDirOverride=`.
- Serwery uruchamiane przez **dwa pliki BAT** — BAT menedżera otwiera BAT serwera w osobnym oknie `cmd /k`.

## 7. RCON i dawanie przedmiotów

RCON używa **protokołu Source RCON** (`src/backend/rcon.js`).

- **Dawanie przedmiotu:** `giveitemtoplayer <ARKID> "<BlueprintPath>" <qty> <quality> <forceBP>`
  - PlayerID **musi być ARKID (PlayerDataID)**, a nie indeksem z `ListPlayers`.
  - Ilość dzielona na porcje po 100 (limit stacku ARK).
  - Każda komenda używa **świeżego połączenia RCON** (bez martwych socketów).
- ARKID gracza odczytywany z `<install>\ShooterGame\Saved\SavedArks\<STEAMID>.arkprofile`.

## 8. Mody (ASE)

Instalacja modów używa poprawnej metody ARK:
- flaga `-automanagedmods`
- `[ModInstaller] ModIDS=<id>` w `Game.ini`
- `ActiveMods=<ids>` w `GameUserSettings.ini` → `[ServerSettings]`

Serwer sam pobiera mody i tworzy poprawne binarne pliki `.mod`.

## 9. Bezpieczeństwo

- **W kodzie źródłowym nie ma żadnych sekretów.** Hasła admina, serwera i tokeny są
  przechowywane runtime w bazie SQLite (`%APPDATA%\ArkAdminManager\ark_admin.db`).
- `*.db`, `*.sqlite` i `*.log` są wykluczone z repozytorium (patrz `.gitignore`).
- Nie commituj `sdkconfig`, lokalnych skryptów diagnostycznych ani baz runtime.

## 10. Historia zmian

Pełna historia wersji: [CHANGELOG.md](CHANGELOG.md).
