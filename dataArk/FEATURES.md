# ArkAdminManager — Pokrycie funkcji i weryfikacja

Aplikacja: **ArkAdminManager** (Electron 33 + sql.js + Express web UI 8090) — ASE + ASA, Windows.
Autor: Kruzio · Licencja: MIT

## Pełna lista funkcji
| Funkcja | Status |
|---|---|
| ASE + ASA w jednej aplikacji | ✅ |
| Install/Update/Validate (SteamCMD) | ✅ |
| Start/Stop/Restart | ✅ |
| Safe stop (SaveWorld → DoExit + weryfikacja) | ✅ |
| RCON konsola | ✅ |
| Player manager (kick/ban/whitelist/admin/give + admin po SteamID) | ✅ |
| Give Item — osobna zakładka (serwer + gracz + kategorie + lista + ilość) | ✅ |
| Give Blueprint — osobna zakładka (recepty z jakością biały→czerwony) | ✅ |
| Welcome Pack + Event Gifts z edytorem (katalog itemów do kliknięcia) | ✅ |
| Cluster manager (10 funkcji + wizualizacja) | ✅ |
| Backup auto + rotacja + restore 1-klik | ✅ |
| Backup przed update | ✅ |
| Guardian (auto-restart po crash, auto-start, auto-update) | ✅ |
| Check update (Steam build) | ✅ |
| Config snapshots + rollback (staging/baseline) | ✅ |
| Discord bot + cross-chat | ✅ |
| Scheduler (cron) | ✅ |
| Email powiadomienia | ✅ |
| System monitor (CPU/RAM/disk) | ✅ |
| Hardware alloc (CPU affinity/priority) | ✅ |
| Web UI / zdalny dostęp (8090) | ✅ |
| Auto-detect istniejących serwerów | ✅ |
| Multi-instance (AltSaveDirectoryName) | ✅ |
| First-install (VC++/DX/SteamCMD) | ✅ |
| Config editor bogaty (slidery/bool/helpery) + live czytanie INI | ✅ |
| Opisy konfiguracji (100% — 347 kluczy) + legenda | ✅ |
| Dashboard zasoby (CPU %, RAM całość, RAM per serwer online) | ✅ |
| Przełącznik PL/EN | ✅ |
| File manager | ⚠️ |
| Config generator (INI) | ✅ |
| Plugin system (AsaApi) | ⚠️ |
| Cloud backup | ⚠️ (FTP) |
| AI assistant | ❌ (celowo pominięte) |

## Nasze przewagi (unikalne)
1. Give Item + katalog 1432 itemów (GFI + kategorie + wyszukiwarka).
2. Welcome Pack + Event Gifts z edytorem paczek.
3. Pełny Player Manager (kick/ban/whitelist/admin/give).
4. Web UI + zdalny dostęp przez przeglądarkę.
5. Email powiadomienia.
6. Auto-detect istniejących serwerów na dyskach.
7. ASE + ASA w jednym.

## Sprawdzenie błędów (2026-08-18)
- get_errors na plikach backendu + main.js: 0 błędów (składnia i linter).
- Naprawione w trakcie prac:
  1. rcon.disconnect() sync → .catch() crash — naprawione _safeDisconnect().
  2. GFI regex \w* pożerał GFI — naprawione [A-Za-z0-9]*.
  3. getCluster/listClusters bez s.cluster_id → fałszywy "Mismatch" — naprawione.
  4. Klaster "bio" miał ścieżkę względną "cluster_bio" → ustawione D:\cluster_bio.
  5. logActivity(0,...) łamał FK — usunięte.
  6. Status per-typ (ASE) oznaczał wszystkie serwery ASE jako running — naprawione _isServerRunning() po ścieżce instalacji.
- Znane ograniczenia:
  - _steamUpToDateCheck bez appmanifest zwraca "brak appmanifest" — OK.
  - First-install wymaga internetu na serwerze (pobiera z microsoft.com).
  - Slidery config mają heurystyczny zakres.
