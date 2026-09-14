// Copyright (c) 2026 Kruzio
// Licensed under the PolyForm Noncommercial License 1.0.0.
// Non-commercial use only. Commercial use and selling of this code are prohibited.
// Derivative works must retain this license and link to: https://github.com/kruzio1985/Ark-Admin-Manager
// https://polyformproject.org/licenses/noncommercial/1.0.0/

/**
 * Ark Admin Manager — Game Registry
 * Definicje gier ARK: ASE i ASA, mapy, konfiguracje
 */
class GameRegistry {
  static getGames() {
    return {
      ASE: {
        id: 'ASE',
        name: 'ARK: Survival Evolved',
        shortName: 'ASE',
        icon: '🦖',
        steamAppId: '376030',
        workshopAppId: '346110',
        exeName: 'ShooterGameServer.exe',
        defaultPort: 7790,
        defaultQueryPort: 27017,
        defaultRCONPort: 32330,
        modSystem: 'steam_workshop',
        description: 'Classic ARK: Survival Evolved dedicated server',
        maps: [
          { id: 'TheIsland', name: 'The Island', type: 'official' },
          { id: 'TheCenter', name: 'The Center', type: 'official' },
          { id: 'ScorchedEarth', name: 'Scorched Earth', type: 'dlc' },
          { id: 'Ragnarok', name: 'Ragnarok', type: 'mod' },
          { id: 'Aberration', name: 'Aberration', type: 'dlc' },
          { id: 'Extinction', name: 'Extinction', type: 'dlc' },
          { id: 'Valguero', name: 'Valguero', type: 'mod' },
          { id: 'Genesis', name: 'Genesis: Part 1', type: 'dlc' },
          { id: 'CrystalIsles', name: 'Crystal Isles', type: 'mod' },
          { id: 'Genesis2', name: 'Genesis: Part 2', type: 'dlc' },
          { id: 'LostIsland', name: 'Lost Island', type: 'mod' },
          { id: 'Fjordur', name: 'Fjordur', type: 'mod' },
        ],
        // ARK server config sections from ASM
        configSections: [
          'administration',
          'rules',
          'chat',
          'hud',
          'player',
          'dino',
          'environment',
          'structures',
          'engrams',
          'customLevels',
          'engine',
          'game',
          'gameUserSettings',
          'supplyCrates',
          'mapSpawners',
          'spawnSettings',
          'stackSizes',
          'crafting',
          'excludeItems',
          'preventTransfer',
          'sotf',
          'pgm',
        ],
      },
      ASA: {
        id: 'ASA',
        name: 'ARK: Survival Ascended',
        shortName: 'ASA',
        icon: '🦕',
        steamAppId: '2430930',
        workshopAppId: null, // ASA uses CurseForge, not Steam Workshop
        exeName: 'ArkAscendedServer.exe',
        defaultPort: 7790,
        defaultQueryPort: 27017,
        defaultRCONPort: 32330,
        modSystem: 'curseforge',
        description: 'Next-gen ARK: Survival Ascended (Unreal Engine 5)',
        maps: [
          { id: 'TheIsland', name: 'The Island', type: 'official' },
          { id: 'ScorchedEarth', name: 'Scorched Earth', type: 'official' },
          { id: 'TheCenter', name: 'The Center', type: 'official' },
          { id: 'Aberration', name: 'Aberration', type: 'official' },
          { id: 'Extinction', name: 'Extinction', type: 'official' },
          { id: 'ClubARK', name: 'Club ARK', type: 'official' },
        ],
        configSections: [
          'administration',
          'rules',
          'chat',
          'hud',
          'player',
          'dino',
          'environment',
          'structures',
          'engrams',
          'customLevels',
          'engine',
          'game',
          'gameUserSettings',
          'supplyCrates',
          'mapSpawners',
          'spawnSettings',
          'stackSizes',
          'crafting',
          'asa',
        ],
        // ASA-specific differences
        differences: {
          usesCurseForge: true,
          noSteamWorkshop: true,
          clusterKey: 'ClusterIdOverride',
          configPath: 'ShooterGame/Saved/Config/WindowsServer',
          usesOverrideOfficialDifficulty: true,
        },
      },
    };
  }

  static getGame(gameType) {
    return this.getGames()[gameType] || null;
  }

  static getMaps(gameType) {
    const game = this.getGame(gameType);
    return game?.maps || [];
  }

  static getConfigSections(gameType) {
    const game = this.getGame(gameType);
    return game?.configSections || [];
  }

  /**
   * Get all possible task types for the scheduler
   */
  static getTaskTypes() {
    return [
      { id: 'server_update', name: 'Server Update', description: 'Update server files via SteamCMD' },
      { id: 'server_backup', name: 'Server Backup', description: 'Create backup of server data' },
      { id: 'server_restart', name: 'Server Restart', description: 'Restart server with grace period' },
      { id: 'server_shutdown', name: 'Server Shutdown', description: 'Stop the server' },
      { id: 'server_start', name: 'Server Start', description: 'Start the server' },
      { id: 'broadcast', name: 'Broadcast Message', description: 'Send message to players via RCON' },
      { id: 'dino_wipe', name: 'Dino Wipe', description: 'Destroy all wild dinos' },
      { id: 'world_save', name: 'World Save', description: 'Force save world' },
    ];
  }

  /**
   * Get server statuses
   */
  static getStatuses() {
    return {
      stopped: { label: 'Stopped', color: '#ef4444', icon: '⏹' },
      starting: { label: 'Starting', color: '#f59e0b', icon: '▶' },
      running: { label: 'Running', color: '#22c55e', icon: '✅' },
      stopping: { label: 'Stopping', color: '#f59e0b', icon: '⏸' },
      installing: { label: 'Installing', color: '#3b82f6', icon: '📥' },
      updating: { label: 'Updating', color: '#3b82f6', icon: '🔄' },
      error: { label: 'Error', color: '#ef4444', icon: '❌' },
    };
  }

  /**
   * Get activity types for logging
   */
  static getActivityTypes() {
    return [
      'created', 'updated', 'deleted',
      'installed', 'started', 'stopped', 'restarted',
      'crash', 'player_join', 'player_leave',
      'cluster_join', 'cluster_leave',
      'backup_created', 'backup_restored',
      'mod_installed', 'mod_removed',
      'config_changed', 'update_completed',
    ];
  }
}

module.exports = GameRegistry;
