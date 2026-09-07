# ArkAdminManager — Status i TODO

Aplikacja: **ArkAdminManager** (Electron 33 + sql.js + Express web UI 8090) — ASE + ASA, Windows.
Autor: Kruzio · Licencja: MIT

## Zrobione
- ASE + ASA, install/update/validate (SteamCMD), start/stop/restart
- Safe stop: SaveWorld → DoExit (weryfikacja zapisu świata)
- RCON konsola + player manager (kick/ban/whitelist/admin/give + Admin Management po SteamID)
- 🎁 Give Item — osobna zakładka w menu bocznym (serwer + gracz + kategoria + lista + ilość)
- 📜 Give Blueprint — osobna zakładka (to samo + jakość tier biały→czerwony)
- Welcome Pack + prezenty eventowe (edytor paczek z katalogiem itemów: kategorie + lista do kliknięcia, auto-welcome z opóźnieniem)
- Cluster manager (10 funkcji + wizualizacja, edycja folderu klastra)
- Backup auto + rotacja + restore 1-klik + backup przed update
- Guardian self-healing (auto-restart po crash, auto-start, auto-update)
- Config snapshots (staging/baseline) + rollback
- Discord bot + cross-chat, scheduler (cron), email, system monitor
- CPU affinity/priority (dropdown rdzenie/wątki + custom) + web UI (8090) + auto-detect
- Multi-instance (AltSaveDirectoryName), first-install (VC++/DX/SteamCMD)
- Config editor bogaty (slidery, bool, helpery ⓘ) + live czytanie INI + legenda (oswajanie/breeding)
- 100% opisów konfiguracji (347 kluczy, 27 sekcji)
- File manager, config generator (INI), UPnP, tribe log, AsaApi plugins
- 📊 Dashboard zasoby: CPU %, RAM całość, RAM per serwer online
- Tło ARK + przezroczyste panele
- Przełącznik PL/EN (menu + górny pasek)
- Native menu Pomoc (Plik/Widok/Pomoc) + O programie (Kruzio, MIT)
- Klucze API (Steam Web API + CurseForge) w Settings

## TODO (kolejność wg ważności)
1. Plugin system rozszerzony
2. Cloud backup (FTP już jest; S3/Drive/Dropbox/B2)
3. AI assistant (celowo pominięte — za ciężkie do postawienia na serwerze)
4. Pełny i18n — przełącznik PL/EN tłumaczy menu, ale nie każdy napis w aplikacji

## Itemy ASE vs ASA
- Wspólne itemy (Wood, Stone, MetalIngot, CementingPaste…) — te same GFI w ASE i ASA.
- ASA ma dodatkowe nowe itemy.
- Używać GFI (krótka nazwa), nie pełnych ścieżek blueprintów.
