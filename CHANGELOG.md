# ARK Admin Manager — Historia zmian (Changelog)

Aplikacja do zarządzania serwerami ARK: Survival Evolved (ASE) i Survival Ascended (ASA).
Electron 33 + sql.js (SQLite WASM) + Express (web UI :8090) + Source RCON + SteamCMD.
Serwer produkcyjny: **<IP-serwera>** (Windows).

---

## 1.0.27 (2026-08-22) — FINALNA wersja: FIX "give item nic nie robi"

**Problem:** Aplikacja nie dawała przedmiotów mimo że ręczny RCON działał.
**Przyczyny:**
1. `giveItemToPlayer` / `_ensureRcon` używały cache `rconConnections` — po restarcie
   serwera trzymał martwy socket (komenda "wychodziła", ale nic nie docierało).
2. Serwer ARK bywał chwilowo wyłączony — w logu `connect ECONNREFUSED 127.0.0.1:32330`.

**Fix:**
- `giveItemToPlayer` i `_ensureRcon` tworzą teraz **ZAWSZE świeże połączenie RCON**
  (`rcon.connect()` + `finally { _safeDisconnect() }`), bez cache.
- Komenda: `giveitemtoplayer <ARKID> "<BlueprintPath>" <qty> <quality> <forceBP 0/1>`
  (ilość dzielona na porcje po 100).
- Dodany log `[RCON] giveItem => <komenda>` w `rcon.js`.

**Weryfikacja:** web API + przeglądarka end-to-end — `Dano MetalIngot x1 graczowi
<STEAMID>`, serwer potwierdził `Server received`, item fizycznie dociera.

---

## 1.0.26 (2026-08-22) — Instalator modów przez Workshop (automanagedmods)

- `-automanagedmods` w argumencie startowym ASE + `[ModInstaller] ModIDS=<id>` w Game.ini
  + `ActiveMods=<ids>` w GameUserSettings.ini `[ServerSettings]`.
- Serwer sam pobiera mody z Workshop i tworzy poprawny **binarny .mod (296 B)**.
- Usunięte kopiowanie modów do `Content\Mods` (robi to serwer).

**Potwierdzone:** Structures Plus (731604991) pobrany i załadowany (58 MB + .mod 296 B).

---

## 1.0.25 — Merge-mode GameUserSettings.ini

- `_generateGameUserSettingsIni` przepisany na tryb MERGE (parsuje istniejący plik,
  zachowuje `[ServerSettings]`, aktualizuje tylko zarządzane klucze).
- `_ensureActiveModsInConfig` — chirurgiczny zapis ActiveMods bez nadpisywania pliku.

**Ważne:** nigdy nie regenerować GameUserSettings.ini przez saveConfig (zniszczy config gracza).

---

## 1.0.24 — ActiveMods zamiast GameModIds

- Mod ładowany przez `ActiveMods` w `[ServerSettings]` (poprawna metoda ARK).
- Usunięty `GameModIds` z linii komend (powodował zawieszenie serwera).

---

## 1.0.23 — Usunięte ręczne tworzenie .mod

- Instalator modów NIE tworzy już tekstowego pliku `.mod` — to powodowało crash
  `Invalid BufferCount=0` (plik musi być binarny, tworzy go serwer).

---

## 1.0.22 — Give item: porcje po 100 + ActiveMods + defensywny listMods

- `rcon.giveItem` dzieli ilość na porcje po 100 (ARK obcina do max stack = 100; "1000" dawało 100).
- `_writeActiveMods` dopisuje `ActiveMods` do GameUserSettings.ini `[ServerSettings]`.
- `listMods` defensywny (undefined → []).

---

## 1.0.21 — KRYTYCZNY FIX give item: ARKID zamiast indeksu ListPlayers

- `giveitemtoplayer` wysyłał indeks z ListPlayers ("0. Kruzio") — gra nic nie dawała.
- ARK wymaga **PlayerDataID (ARKID)**, np. <ARKID> dla danego gracza.
- ARKID czytany z `<install>\ShooterGame\Saved\SavedArks\<STEAMID>.arkprofile`:
  ASCII `PlayerDataID` → `UInt64Property` → uint64 LE.
- UI przekazuje SteamID (nie indeks) w give item/blueprint/packs.

---

## 1.0.20 — Osobne zakładki Give Item / Give Blueprint + katalog paczek

- Give Item i Give Blueprint jako osobne zakładki w menu (nie modale).
- Edytor paczek ma katalog itemów (kategoria + szukaj + lista klikalna).

---

## 1.0.19 (dalsze) — Dashboard zasoby + CPU cores + osobne menu Give

- Karty CPU%/RAM + RAM per serwer (Get-CimInstance Win32_Process).
- Edit modal: select CPU Cores (affinity, wątki logiczne 0-7).
- Give Item / Give Blueprint jako osobne modale (quality tier 0-5).

---

## 1.0.18 → 1.0.19 — Live config + Help + polerka

- `getConfig` czyta LIVE wartości z Game.ini + GameUserSettings.ini (merge).
- Menu Help (Plik/Widok/Pomoc), "O programie" (Autor: Kruzio, MIT).
- Tło ARK + przezroczyste panele + legenda configu + przełącznik PL/EN.
- Fix statusu per-typ (`_isServerRunning` po install_path, nie per-typ).
- Fix `ModManager._getSteamWorkshopDetails` (brakowało Content-Type form-urlencoded).

---

## 1.0.17 — Domknięcie braków konkurencji

- 2-stopniowy save barrier przy stop (SaveWorld → "World Save Complete" → DoExit).
- Cross-chat Discord ↔ serwer (dwukierunkowy).
- Config generator (generateIni), File manager, UPnP, Tribe log.
- Visual cluster (SVG przeciągalne), Cloud backup FTP, AsaApi plugin manager.
- ASA depot rollback (SteamCMD download_depot).

---

## 1.0.16 — First-Install + slidery configu

- first-install.js: SteamCMD + DirectX June2010 + VC++2013/2022 (auto-instalacja).
- Config editor: slidery (range + number) zamiast pól numerycznych.

---

## 1.0.14 → 1.0.15 — Guardian + Update + Backup + Snapshot + CPU

- 🛡 Guardian self-healing (auto-restart po crash, auto-start przy boot).
- checkupdate (buildid + Steam Web API), auto-update.
- Backup rotacja (delete_old/delete_days), pre-update backup.
- 📸 Config snapshots, AltSaveDirectoryName, CPU affinity/priority.

---

## 1.0.13 — Pełny Cluster Manager (10 funkcji)

- ensureClusterFolder, selectiveSyncProfiles, applyConfigToCluster, backupClusterFolder,
  listClusterData, transferClusterData, baseline snapshot, diagnoseCluster,
  syncModsAcrossCluster, clusterAction start/stop/restart.
- Edit cluster (updateCluster) + wizualizacja SVG.

---

## 1.0.12 — Give Item + Paczki/Prezenty

- Katalog itemów (1432 itemy z ASM GameData).
- Give Item (Player Manager → 🎁 Give).
- Paczki welcome/gift + edytor + opóźnienie welcome (pending_welcome).

---

## 1.0.5 → 1.0.11 — Start/stop/status/cluster

- 1.0.5: stop per-serwer (kill po install_path) + live status + auto-odświeżanie UI.
- 1.0.6: usunięta flaga `-nullrhi` (naprawia ASE RequestExit(1)).
- 1.0.7: live status przez tasklist per typ.
- 1.0.8: cluster ASA `-ClusterIdOverride` jako osobna flaga.
- 1.0.9: 👑 Admin gracza (ServerAdmins) + naprawa czytania logu konsoli.
- 1.0.10: auto-detekcja mapy + modal wyboru mapy przy imporcie + ✏ Edytuj.
- 1.0.11: naprawa stop (escaping) + RCON graceful (SaveWorld+DoExit) → wait 5s → force-kill.

---

## 1.0.3 → 1.0.4 — Fundament

- 1.0.3: Web UI (Express :8090, /api/invoke + dispatchChannel), autostart, firewall.
- 1.0.4: stack-trace do logowania błędów /api/invoke + fix pustych zakładek (stray `</div>`).

---

## Kluczowe wnioski techniczne (lekcje)

- **RCON**: `rcon.disconnect()` jest SYNC — używać `_safeDisconnect` (try/catch), nie `.catch()`.
- **Give item**: `giveitemtoplayer <ARKID> ...` — ARKID z .arkprofile, NIE indeks ListPlayers.
  "Server received, But no response!!" = ACK (komenda wykonana).
- **Porty** (bez kolizji): ASE=7790/27017/32330, ASA=7850/27050/32400, RCON = 3. port.
- **Mody ASE**: `-automanagedmods` + `[ModInstaller] ModIDS` + `ActiveMods` w `[ServerSettings]`.
  NIGDY nie tworzyć .mod ręcznie (tekstowy = crash).
- **GameUserSettings.ini**: NIGDY nie regenerować — merge chirurgiczny (chroni config gracza).
- **Cluster ASE**: ClusterDirOverride = PEŁNA ścieżka (np. D:\cluster_bio).
- **Start ASE**: bez `-nullrhi` (UE4). Bezpośrednio ShooterGameServer.exe z mapą `?listen?...`.
- **GUI Electron** nie działa headless (sesja 0) — uruchamiać w sesji RDP (schtasks /it).
- **Po deployu**: `taskkill /F /IM "ARK Admin Manager.exe"` → `schtasks /run /tn ARKAdminManager`.
- **Build**: `npm.cmd run build:installer` (nie npm.ps1). Sprawdzać rozmiar .exe (~85 MB).
- **Deploy**: scp/ssh pełną ścieżką `C:\WINDOWS\System32\OpenSSH\*.exe` + retry (PATH się gubi).
- **ARKID gracza**: ARKID=<ARKID>, SteamID=<STEAMID> (odczytywane z pliku .arkprofile).

## Stan finalny (1.0.27)

- Wersja wdrożona na serwerze produkcyjnym (web UI :8090).
- Serwery: id=1 ASA (arkascendedserver), id=2 ASE (arkevolvedserver), id=9 evolved2.
- Mod S+ (731604991) załadowany na ASE.
- Give item / blueprint / paczki działają przez świeże połączenia RCON.
