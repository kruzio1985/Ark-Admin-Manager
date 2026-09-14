// Copyright (c) 2026 Kruzio
// Licensed under the PolyForm Noncommercial License 1.0.0.
// Non-commercial use only. Commercial use and selling of this code are prohibited.
// https://polyformproject.org/licenses/noncommercial/1.0.0/

/**
 * Ark Admin Manager — Config Parser
 * PEŁNA obsługa wszystkich sekcji konfiguracyjnych ASM + ASA
 * 
 * ZASADA: INI MERGE MODE — NIGDY nie nadpisujemy całego pliku!
 * Podmieniamy tylko zmienione klucze, reszta zostaje bez zmian.
 */
const path = require('path');
const fs = require('fs');

class ConfigParser {
  constructor(db) {
    this.db = db;
    this.gamedataCache = new Map();
  }

  // ═══════════════════════════════════════════════════════════════════
  // DEFAULT CONFIGURATIONS (ALL ASM SECTIONS)
  // ═══════════════════════════════════════════════════════════════════

  getDefaults(gameType) {
    const isASA = gameType === 'ASA';
    
    const defaults = {
      // ── Administration ──
      administration: {
        ServerAdminPassword: '',
        ServerPassword: '',
        MaxPlayers: 70,
        SpectatorPassword: '',
        ServerHardcore: false,
        ServerForceNoHud: false,
        ServerPVE: false,
        ServerCrosshair: true,
        ServerForceNoHud_AllowMap: true,
        ShowMapPlayerLocation: true,
        EnablePvPGamma: false,
        AllowThirdPersonPlayer: false,
        ServerPasswordRequiredForSpectator: false,
        DisableStructureDecayPvE: false,
        DisableDinoDecayPvE: false,
        DisablePvEGamma: false,
        AdminLogging: true,
      },

      // ── Rules ──
      rules: {
        DifficultyOffset: 0.2,           // 0.0-1.0 (ASE), ASA uses OverrideOfficialDifficulty
        OverrideOfficialDifficulty: 5.0,  // ASA only
        MaxTamedDinos: 5000,
        MaxStructuresInRange: 10500,
        DayCycleSpeedScale: isASA ? 1.0 : 0.5,  // ASA default faster
        DayTimeSpeedScale: isASA ? 0.35 : 0.5,
        NightTimeSpeedScale: isASA ? 0.65 : 0.5,
        TamingSpeedMultiplier: isASA ? 3.0 : 2.0,
        HarvestAmountMultiplier: isASA ? 2.0 : 1.5,
        XPMultiplier: isASA ? 2.0 : 1.0,
        ResourcesRespawnPeriodMultiplier: 1.0,
        BabyMatureSpeedMultiplier: isASA ? 15.0 : 10.0,
        EggHatchSpeedMultiplier: isASA ? 15.0 : 10.0,
        MatingIntervalMultiplier: isASA ? 0.5 : 0.75,
        BabyCuddleIntervalMultiplier: isASA ? 0.15 : 0.3,
        BabyImprintingStatScaleMultiplier: 1.0,
        BabyCuddleGracePeriodMultiplier: 1.0,
        CropGrowthSpeedMultiplier: 2.0,
        FuelConsumptionIntervalMultiplier: 1.0,
        StructureDamageMultiplier: 1.0,
        DinoDamageMultiplier: 1.0,
        PlayerDamageMultiplier: 1.0,
        StructureResistanceMultiplier: 1.0,
        DinoResistanceMultiplier: 1.0,
        PlayerResistanceMultiplier: 1.0,
        PvEStructureDecayPeriodMultiplier: 1.0,
        PvEDinoDecayPeriodMultiplier: 1.0,
        KickIdlePlayersPeriod: 3600,
        EnablePVPTimeout: false,
        PvPTimeInterval: 60,
        AutoSavePeriodMinutes: 15,
        MaxPlatformSaddleStructureLimit: 100,
        PerPlatformMaxStructuresMultiplier: 1.0,
        bUseSingleplayerSettings: false,
        OverrideStructurePlatformPrevention: false,
        PreventOfflinePvP: false,
        PreventOfflinePvPInterval: 900,
        bPvPAllowReduceDamageToBuildings: false,
        bIncreasePvPRespawnInterval: false,
        IncreasePvPRespawnIntervalCheckPeriod: 300,
        IncreasePvPRespawnIntervalMultiplier: 1.0,
        IncreasePvPRespawnIntervalBaseAmount: 60.0,
        bDisableFriendlyFire: false,
        bFlyerCarryPvE: false,
        bAllowCaveBuildingPvE: false,
        bAllowPlatformSaddleMultiFloors: false,
        RaidDinoCharacterFoodDrainMultiplier: 1.0,
        LimitTurretsNum: 100,
        LimitTurretsRange: 10000,
      },

      // ── Chat & Notifications ──
      chat: {
        ChatGlobalChannel: true,
        ChatLocalChannel: true,
        ChatTribalChannel: true,
        ChatAllianceChannel: true,
        GlobalChatEnabled: true,
        ProximityChat: false,
        ShowChatBubbles: true,
        NotificationMessagesEnabled: true,
        ServerAutoForceRespawnWildDinosInterval: 86400,
        ForceRespawnDinosMessage: 'A wild dino wipe is scheduled...',
        EnableAutoDestroyStructures: false,
        AutoDestroyStructuresInterval: 86400,
        AutoDestroyOldStructuresMultiplier: 1.0,
        OnlyAutoDestroyCoreStructures: false,
        OnlyDestroyUnconnectedWaterPipes: false,
        DestroyUnconnectedWaterPipes: false,
        AutoDestroyStructuresMessages: true,
        ChatMessageDisplayTime: 10,
        ChatMessageDisplayPerPage: 5,
      },

      // ── HUD & Visuals ──
      hud: {
        ShowFloatingDamageText: true,
        EnableDeathSpectator: true,
        UseCorpseLocator: true,
        DisableWeatherFog: false,
        ForceShowStructuresOnMap: true,
        ServerAllowThirdPersonAim: false,
        AlwaysAllowMapOverlayOnCrosshairs: false,
        EnableStructurePlacementCollision: false,
        EnableStructureDyeing: true,
        AllowAnyoneBabyImprintCuddle: false,
        AllowHitMarkers: true,
        AllowFloatingHud: true,
        DisableDinoRidingHUD: false,
        AllowRaidDinoFeeding: false,
        UseOptimizedHarvestingHealth: false,
        DisableStructurePlacementCollisionForLadders: false,
        ClampOverheadResources: false,
        AllowCryoFridgeOnSaddle: false,
        NoResourceRadius_Structure: 0.5,
        NoResourceRadius_Player: 0.5,
      },

      // ── Player Settings ──
      player: {
        PlayerCharacterWaterDrainMultiplier: 1.0,
        PlayerCharacterFoodDrainMultiplier: 1.0,
        PlayerCharacterStaminaDrainMultiplier: 1.0,
        PlayerCharacterHealthRecoveryMultiplier: 1.0,
        PlayerDamageMultiplier: 1.0,
        PlayerResistanceMultiplier: 1.0,
        PlayerHarvestingDamageMultiplier: 1.0,
        PlayerHarvestingDamageDivisor: 1.0,
        CustomRecipeEffectivenessMultiplier: 1.0,
        CustomRecipeSkillMultiplier: 1.0,
        PlayerBaseStatMultipliers_Health: 1.0,
        PlayerBaseStatMultipliers_Stamina: 1.0,
        PlayerBaseStatMultipliers_Torpidity: 1.0,
        PlayerBaseStatMultipliers_Oxygen: 1.0,
        PlayerBaseStatMultipliers_Food: 1.0,
        PlayerBaseStatMultipliers_Water: 1.0,
        PlayerBaseStatMultipliers_Temperature: 1.0,
        PlayerBaseStatMultipliers_Weight: 1.0,
        PlayerBaseStatMultipliers_MeleeDamage: 1.0,
        PlayerBaseStatMultipliers_SpeedMultiplier: 1.0,
        PlayerBaseStatMultipliers_Fortitude: 1.0,
        PlayerBaseStatMultipliers_CraftingSkill: 1.0,
        PerLevelStatsMultiplier_Player_Health: 1.0,
        PerLevelStatsMultiplier_Player_Stamina: 1.0,
        PerLevelStatsMultiplier_Player_Torpidity: 1.0,
        PerLevelStatsMultiplier_Player_Oxygen: 1.0,
        PerLevelStatsMultiplier_Player_Food: 1.0,
        PerLevelStatsMultiplier_Player_Water: 1.0,
        PerLevelStatsMultiplier_Player_Temperature: 1.0,
        PerLevelStatsMultiplier_Player_Weight: 1.0,
        PerLevelStatsMultiplier_Player_MeleeDamage: 1.0,
        PerLevelStatsMultiplier_Player_Speed: 1.0,
        PerLevelStatsMultiplier_Player_Fortitude: 1.0,
        PerLevelStatsMultiplier_Player_CraftingSkill: 1.0,
        MaxNumberOfPlayersInTribe: 70,
        DisableImprintDinoBuff: false,
        PreventDiseases: false,
        NonPermanentDiseases: false,
        DisableDinoRiding: false,
        ForceFlyerExplosives: false,
        OverridePlayerLevelEngramPoints: 0,
      },

      // ── Dino Settings ──
      dino: {
        DinoCharacterFoodDrainMultiplier: 1.0,
        DinoCharacterStaminaDrainMultiplier: 1.0,
        DinoCharacterHealthRecoveryMultiplier: 1.0,
        DinoCountMultiplier: 1.0,
        DinoDamageMultiplier: 1.0,
        DinoResistanceMultiplier: 1.0,
        DinoHarvestingDamageMultiplier: 1.0,
        DinoTurretDamageMultiplier: 1.0,
        TamedDinoCharacterFoodDrainMultiplier: 1.0,
        TamedDinoClassDamageMultipliers: {},
        TamedDinoClassResistanceMultipliers: {},
        WildDinoClassDamageMultipliers: {},
        WildDinoClassResistanceMultipliers: {},
        TamedDinoBaseStatMultipliers_Health: 1.0,
        TamedDinoBaseStatMultipliers_Stamina: 1.0,
        TamedDinoBaseStatMultipliers_Oxygen: 1.0,
        TamedDinoBaseStatMultipliers_Food: 1.0,
        TamedDinoBaseStatMultipliers_Weight: 1.0,
        TamedDinoBaseStatMultipliers_MeleeDamage: 1.0,
        TamedDinoBaseStatMultipliers_SpeedMultiplier: 1.0,
        TamedDinoBaseStatMultipliers_Torpidity: 1.0,
        PerLevelStatsMultiplier_DinoTamed_Health: 1.0,
        PerLevelStatsMultiplier_DinoTamed_Stamina: 1.0,
        PerLevelStatsMultiplier_DinoTamed_Oxygen: 1.0,
        PerLevelStatsMultiplier_DinoTamed_Food: 1.0,
        PerLevelStatsMultiplier_DinoTamed_Weight: 1.0,
        PerLevelStatsMultiplier_DinoTamed_MeleeDamage: 1.0,
        PerLevelStatsMultiplier_DinoTamed_Speed: 1.0,
        PerLevelStatsMultiplier_DinoWild_Health: 1.0,
        PerLevelStatsMultiplier_DinoWild_Stamina: 1.0,
        PerLevelStatsMultiplier_DinoWild_Oxygen: 1.0,
        PerLevelStatsMultiplier_DinoWild_Food: 1.0,
        PerLevelStatsMultiplier_DinoWild_Weight: 1.0,
        PerLevelStatsMultiplier_DinoWild_MeleeDamage: 1.0,
        PerLevelStatsMultiplier_DinoWild_Speed: 1.0,
        UseSinglePlayerDinoSettings: false,
        AllowRaidDinoFeeding: false,
        RaidDinoCharacterFoodDrainMultiplier: 1.0,
        ActiveTamedDinosLogging: false,
        DestroyTamesWhenLoggedOut: false,
        bPvEDisableFriendlyFire: false,
        bDisableDinoBreeding: false,
        bAllowFlyerSpeedLeveling: true,
      },

      // ── Environment ──
      environment: {
        GlobalSpoilingTimeMultiplier: 1.0,
        GlobalItemDecompositionTimeMultiplier: 1.0,
        GlobalCorpseDecompositionTimeMultiplier: 1.0,
        ResourceNoReplenishRadiusPlayers: 1.0,
        ResourceNoReplenishRadiusStructures: 1.0,
        ResourcesRespawnPeriodMultiplier: 1.0,
        SupplyCrateLootQualityMultiplier: 1.0,
        FishingLootQualityMultiplier: 1.0,
        CropDecaySpeedMultiplier: 1.0,
        LayEggIntervalMultiplier: 1.0,
        PoopIntervalMultiplier: 1.0,
        CropGrowthSpeedMultiplier: 1.0,
        StructureDamageRepairCooldown: 180,
        EventColorsChanceOverride: 0.0,
        bPvEAllowStructuresAtSupplyDrops: true,
        bDisableLootCrates: false,
        bDisableStructurePlacementCollision: false,
        HexagonRewardMultiplier: 1.0,
        OverrideMaxExperiencePointsDino: 0,
        OverrideMaxExperiencePointsPlayer: 0,
        UseCorpseLifeSpanMultiplier: 1.0,
      },

      // ── Structures ──
      structures: {
        OverrideStructurePlatformPrevention: false,
        StructureDamageMultiplier: 1.0,
        StructureResistanceMultiplier: 1.0,
        bPassiveDefensesDamageRiderlessDinos: false,
        DestroyTamesWhenLoggedOut: false,
        DestroyUnconnectedWaterPipes: false,
        AutoDestroyStructures: false,
        PvEStructureDecayPeriodMultiplier: 1.0,
        PvEDinoDecayPeriodMultiplier: 1.0,
        bAutoDestroyOldStructures: false,
        StructurePreventResourceRadiusMultiplier: 1.0,
        TheMaxStructuresInRange: 10500,
        MaxStructuresInRange: 10500,
        NewMaxStructuresInRange: 10500,
        TurretLimit: 100,
      },

      // ── Engrams ──
      engrams: {
        OverrideEngramEntries: [],     // Custom engram overrides
        OverrideNamedEngramEntries: [], // Named engram overrides
        AutoUnlockAllEngrams: false,
        OnlyAllowSpecifiedEngrams: false,
        bAutoUnlockAllEngrams: false,
        OverridePlayerLevelEngramPoints: 0,
      },

      // ── Custom Levels ──
      customLevels: {
        ExperiencePointsForLevel: {},  // Level→XP mapping
        OverrideMaxExperiencePointsPlayer: 0,
        OverrideMaxExperiencePointsDino: 0,
        UseCustomExperienceCurve: false,
        CustomLevelXPIncrease_Player: 1000,
        CustomLevelXPIncrease_Dino: 1000,
      },

      // ── Server Files (Engine.ini) ──
      engine: {
        // Network
        'net.MaxIdleTime': 0,
        'ConnectionTimeout': 600.0,
        'InitialConnectTimeout': 120.0,
        // Online
        'OnlineSubsystemUtils.IpNetDriver.MaxClientRate': 60000,
        'OnlineSubsystemUtils.IpNetDriver.MaxInternetClientRate': 60000,
        // TaskGraph
        'TaskGraph.EnableTaskGraphMultiThreading': true,
        // Rendering
        'Slate.PostProcessing.Enable': false,
        'r.VSync': 0,
        // Audio
        'AudioThread.EnableBatchProcessing': true,
      },

      // ── Custom Game.ini Settings ──
      game: {
        '/Script/ShooterGame.ShooterGameMode': {},
        '/Script/Engine.GameSession': {
          MaxPlayers: 70,
        },
      },

      // ── Custom GameUserSettings.ini ──
      gameUserSettings: {
        '/Script/ShooterGame.ShooterGameUserSettings': {
          MasterAudioVolume: 1.0,
          MusicAudioVolume: 1.0,
          SFXAudioVolume: 1.0,
          VoiceAudioVolume: 1.0,
          UIScaling: 1.0,
          CameraShakeScale: 1.0,
          bFirstPersonRiding: false,
          bThirdPersonPlayer: false,
        },
      },

      // ── Supply Crate Overrides ──
      supplyCrates: [],

      // ── Map Spawner Overrides ──
      mapSpawners: [],

      // ── NPC Spawn Settings ──
      spawnSettings: {},

      // ── Stack Size Overrides ──
      stackSizes: {},

      // ── Crafting Overrides ──
      crafting: {},

      // ── Exclude Item Indices ──
      excludeItems: [],

      // ── Prevent Transfer Overrides ──
      preventTransfer: {
        PreventTransferGridHeight: '400',
      },

      // ── SOTF ──
      sotf: {
        bUseSOTFServer: false,
        SOTFRoundTime: 1200,
        SOTFPreludeTime: 300,
        SOTFLobbyCountdownTime: 60,
        SOTFBattleEyeCheckInterval: 30,
      },

      // ── PGM (Procedurally Generated Maps) ──
      pgm: {
        PGMTerrainProperties: {},
      },

      // ── ASA Specific ──
      asa: {
        ServerPlatform: 'PC',
        DisableNvidiaHighlights: false,
        AllowCaveBuildingPVE: false,
        UseServerPasswordAsAdminPassword: false,
        ActiveMods: [],
        ActiveCurseForgeMods: [],
      },

      // ── Server Update Settings ──
      serverUpdate: {
        EnableUpdate: false,
        UpdatePeriod: 60,
        UseSmartCopy: true,
        ValidateServerFiles: true,
        UpdateModsWhenUpdatingServer: true,
        ForceUpdateMods: false,
        ForceCopyMods: false,
        ForceUpdateModsIfNoSteamInfo: true,
        RetryOnFail: false,
        ShowUpdateReason: true,
        OverrideServerStartup: false,
        ParallelUpdate: false,
        SequencialDelayPeriod: 10,
        VerifyServerAfterUpdate: false,
        UpdateReasonPrefix: 'Server Update Reason:',
        CacheDir: '',
        RedirectOutput: false,
        IgnoreExitStatusCodes: '',
        TaskPriority: 32,
        OnServerStart: false,
      },

      // ── Server Shutdown Settings ──
      serverShutdown: {
        GracePeriod: 15,
        EnableWorldSave: true,
        WorldSaveDelay: 60,
        UseShutdownCommand: true,
        CheckForOnlinePlayers: true,
        SendShutdownMessages: true,
        AllMessagesShowReason: false,
        CloseShutdownWindowWhenFinished: true,
        CancelMessage: 'Server shutdown has been cancelled.',
        TaskPriority: 32,
      },

      // ── Server Restart Settings ──
      serverRestart: {
        EnabledGracePeriod: false,
        GracePeriod: 0,
        EnableWorldSave: true,
        SendMessages: true,
      },

      // ── Server Start Settings ──
      serverStart: {
        ValidateProfileOnStart: true,
        ServerStartMinimized: false,
        TaskPriority: 32,
      },

      // ── Firewall Settings ──
      firewall: {
        ManageAutomatically: false,
        ManagePublicIPAutomatically: true,
      },

      // ── Public IP ──
      network: {
        MachinePublicIP: '',
        ServerCallUrlLast: '',
        CheckIfServerManagerRunningOnStartup: true,
      },

      // ── Server Monitor ──
      serverMonitor: {
        WindowWidth: 900,
        WindowHeight: 500,
        WindowLeft: 50,
        WindowTop: 50,
        WindowState: 0,
        MessageOutputHeight: 100,
        EnableActions: true,
        ShowActionConfirmation: true,
      },

      // ── Main Window ──
      mainWindow: {
        Width: 1100,
        Height: 900,
        Left: 50,
        Top: 50,
        WindowState: 0,
        MinimizeToTray: false,
      },

      // ── RCON Settings ──
      rconSettings: {
        PlayerListSort: 1,
        PlayerListFilter: 2,
        AdminName: '',
        MessageCommand: 'Broadcast',
        BackupMessageCommand: 'Broadcast',
      },

      // ── Backup Settings ──
      backupSettings: {
        EnableBackup: false,
        BackupPeriod: 60,
        ParallelBackup: true,
        SequencialDelayPeriod: 10,
        DeleteOldFiles: true,
        DeleteInterval: 30,
        IncludeSaveGamesFolder: false,
        BackupWorldFile: true,
        WorldSaveMessage: 'A world save is about to be performed, you may experience some lag during this process.',
        TaskPriority: 32,
      },

      // ── Profile Sync Settings ──
      profileSync: {
        SyncModIdsEnabled: false,
        SyncCrossArkClusterIdEnabled: false,
        SyncAutoShutdownEnabled: false,
        SyncCustomLevelsEnabled: false,
        SyncEngramsEnabled: false,
      },
    };

    // Sekcje zależne od gry (ASE vs ASA) — zgodnie z game-registry
    if (isASA) {
      // ASA NIE ma: SOTF, PGM, excludeItems, preventTransfer
      delete defaults.sotf;
      delete defaults.pgm;
      delete defaults.excludeItems;
      delete defaults.preventTransfer;
    } else {
      // ASE NIE ma sekcji ASA-specific
      delete defaults.asa;
    }

    return defaults;
  }

  // ═══════════════════════════════════════════════════════════════════
  // CONFIG CRUD
  // ═══════════════════════════════════════════════════════════════════

  async getConfig(serverId) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) throw new Error(`Server ${serverId} not found`);

    let config = null;
    const row = this.db.queryOne(
      'SELECT config_json FROM server_config WHERE server_id = ?', [serverId]
    );
    if (row && row.config_json) {
      try { config = JSON.parse(row.config_json); } catch { config = null; }
    }
    if (!config) config = this.getDefaults(server.game_type);

    // MERGE wartości "live" z plików INI na serwerze (jeśli zainstalowany) —
    // pokazuje realne ustawienia, NIE nadpisuje niczego w plikach.
    const live = this._readIniLive(server);
    if (live) {
      for (const sec of Object.keys(live)) {
        if (!config[sec] || typeof config[sec] !== 'object') config[sec] = {};
        Object.assign(config[sec], live[sec]);
      }
    }
    return config;
  }

  /** Czyta realne ustawienia z Game.ini + GameUserSettings.ini (mapuje na nasz config). */
  _readIniLive(server) {
    if (!server?.install_path) return null;
    const configDir = path.join(server.install_path, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
    const result = { rules: {}, administration: {} };
    let found = false;

    const gameIniPath = path.join(configDir, 'Game.ini');
    if (fs.existsSync(gameIniPath)) {
      try {
        const parsed = this._parseIni(fs.readFileSync(gameIniPath, 'utf8'));
        const gm = parsed['/Script/ShooterGame.ShooterGameMode'] || {};
        const reverseMap = {
          DifficultyOffset: 'DifficultyOffset', OverrideOfficialDifficulty: 'OverrideOfficialDifficulty',
          MaxTamedDinos: 'MaxTamedDinos', MaxStructuresInRange: 'MaxStructuresInRange',
          DayCycleSpeedScale: 'DayCycleSpeedScale', DayTimeSpeedScale: 'DayTimeSpeedScale',
          NightTimeSpeedScale: 'NightTimeSpeedScale', TamingSpeedMultiplier: 'TamingSpeedMultiplier',
          HarvestAmountMultiplier: 'HarvestAmountMultiplier', XPMultiplier: 'XPMultiplier',
          ResourcesRespawnPeriodMultiplier: 'ResourcesRespawnPeriodMultiplier',
          BabyMatureSpeedMultiplier: 'BabyMatureSpeedMultiplier', EggHatchSpeedMultiplier: 'EggHatchSpeedMultiplier',
          MatingIntervalMultiplier: 'MatingIntervalMultiplier', BabyCuddleIntervalMultiplier: 'BabyCuddleIntervalMultiplier',
          BabyImprintingStatScaleMultiplier: 'BabyImprintingStatScaleMultiplier',
          CropGrowthSpeedMultiplier: 'CropGrowthSpeedMultiplier', bUseSingleplayerSettings: 'bUseSingleplayerSettings',
          bDisableStructurePlacementCollision: 'bDisableStructurePlacementCollision',
        };
        for (const [iniKey, configKey] of Object.entries(reverseMap)) {
          if (gm[iniKey] !== undefined) { result.rules[configKey] = gm[iniKey]; found = true; }
        }
      } catch {}
    }

    const gusPath = path.join(configDir, 'GameUserSettings.ini');
    if (fs.existsSync(gusPath)) {
      try {
        const parsed = this._parseIni(fs.readFileSync(gusPath, 'utf8'));
        const ss = parsed['/Script/ShooterGame.ShooterGameUserSettings'] || {};
        const map = {
          ServerPassword: 'ServerPassword', ServerAdminPassword: 'ServerAdminPassword',
          MaxPlayers: 'MaxPlayers', ServerHardcore: 'ServerHardcore', ServerPVE: 'ServerPVE',
          ServerCrosshair: 'ServerCrosshair', ServerForceNoHud: 'ServerForceNoHud',
          ShowMapPlayerLocation: 'ShowMapPlayerLocation', EnablePvPGamma: 'EnablePvPGamma',
          AllowThirdPersonPlayer: 'AllowThirdPersonPlayer', AdminLogging: 'AdminLogging',
          SpectatorPassword: 'SpectatorPassword',
        };
        for (const [iniKey, configKey] of Object.entries(map)) {
          if (ss[iniKey] !== undefined) { result.administration[configKey] = ss[iniKey]; found = true; }
        }
      } catch {}
    }

    return found ? result : null;
  }

  async saveConfig(serverId, config) {
    const json = JSON.stringify(config, null, 2);
    this.db.run(
      `INSERT INTO server_config (server_id, config_json, updated_at)
       VALUES (?, ?, datetime('now','localtime'))
       ON CONFLICT(server_id) DO UPDATE SET config_json = ?, updated_at = datetime('now','localtime')`,
      [serverId, json, json]
    );
    this.db.save();

    // Also write the INI files to the server's install path
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    let iniResult = null;
    if (server && server.install_path) {
      await this._writeIniFiles(server, config);
      iniResult = `INI files written to ${server.install_path}`;
    }

    return { success: true, iniWritten: !!iniResult, message: iniResult || 'Saved to DB (server not installed yet — use "Push to Server" after install)', config };
  }

  async mergeConfig(serverId, section, values) {
    // MERGE MODE: podmienia tylko podane klucze, reszta zostaje
    const current = await this.getConfig(serverId);
    
    if (!current[section]) {
      current[section] = {};
    }

    // Deep merge
    this._deepMerge(current[section], values);

    return await this.saveConfig(serverId, current);
  }

  async validateConfig(serverId) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    const config = await this.getConfig(serverId);
    const errors = [];
    const warnings = [];

    // Validate ports
    if (server.port < 1 || server.port > 65535) errors.push('Invalid game port');
    if (server.query_port < 1 || server.query_port > 65535) errors.push('Invalid query port');
    if (server.rcon_port < 1 || server.rcon_port > 65535) errors.push('Invalid RCON port');

    // Check port conflicts
    if (server.port === server.query_port) errors.push('Game port and query port are the same');
    if (server.port === server.rcon_port) errors.push('Game port and RCON port are the same');

    // Validate difficulty
    if (config.rules) {
      if (config.rules.DifficultyOffset < 0 || config.rules.DifficultyOffset > 1) {
        errors.push('DifficultyOffset must be between 0 and 1');
      }
    }

    // Validate max players
    if (config.game && config.game['/Script/Engine.GameSession']) {
      const mp = config.game['/Script/Engine.GameSession'].MaxPlayers;
      if (mp !== undefined && (mp < 1 || mp > 200)) {
        errors.push('MaxPlayers must be between 1 and 200');
      }
    }

    // Check mod count
    const mods = this.db.query('SELECT COUNT(*) as cnt FROM server_mods WHERE server_id = ? AND active = 1', [serverId]);
    if (mods[0].cnt > 100) {
      warnings.push('More than 100 active mods may cause stability issues');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  async exportConfig(serverId) {
    const config = await this.getConfig(serverId);
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    return {
      serverName: server?.name,
      gameType: server?.game_type,
      mapName: server?.map_name,
      exportedAt: new Date().toISOString(),
      config,
    };
  }

  /** Generator: zwraca wygenerowaną treść Game.ini i GameUserSettings.ini (do kopiowania/pobrania). */
  async generateIni(serverId) {
    const server = this.db.queryOne('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) throw new Error(`Server ${serverId} not found`);
    const config = await this.getConfig(serverId);
    return {
      gameIni: this._generateGameIni(server, config),
      gameUserSettingsIni: this._generateGameUserSettingsIni(server, config),
    };
  }

  async importConfig(serverId, data) {
    if (data && data.config) {
      await this.saveConfig(serverId, data.config);
      // Optionally update server name/map
      if (data.serverName || data.mapName) {
        const updates = {};
        if (data.serverName) updates.name = data.serverName;
        if (data.mapName) updates.map_name = data.mapName;
        if (Object.keys(updates).length) {
          const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
          this.db.run(
            `UPDATE servers SET ${sets} WHERE id = ?`,
            [...Object.values(updates), serverId]
          );
          this.db.save();
        }
      }
    }
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════
  // CONFIG SNAPSHOTS (staging/baseline — rollback)
  // ═══════════════════════════════════════════════════════════════════

  async createSnapshot(serverId, name) {
    const config = await this.getConfig(serverId);
    this.db.run(
      'INSERT INTO config_snapshots (server_id, name, config_json) VALUES (?, ?, ?)',
      [serverId, name || `Snapshot ${new Date().toLocaleString()}`, JSON.stringify(config)]
    );
    this.db.save();
    return this.listSnapshots(serverId);
  }

  listSnapshots(serverId) {
    return this.db.query('SELECT id, server_id, name, created_at FROM config_snapshots WHERE server_id = ? ORDER BY id DESC', [serverId]);
  }

  async restoreSnapshot(snapshotId) {
    const snap = this.db.queryOne('SELECT * FROM config_snapshots WHERE id = ?', [snapshotId]);
    if (!snap) throw new Error(`Snapshot ${snapshotId} not found`);
    const config = JSON.parse(snap.config_json || '{}');
    await this.saveConfig(snap.server_id, config);
    return { success: true, serverId: snap.server_id };
  }

  deleteSnapshot(snapshotId) {
    this.db.run('DELETE FROM config_snapshots WHERE id = ?', [snapshotId]);
    this.db.save();
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════
  // INI FILE GENERATION
  // ═══════════════════════════════════════════════════════════════════

  async _writeIniFiles(server, config) {
    const configDir = path.join(server.install_path, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Game.ini (merge mode — zachowuje istniejące ustawienia)
    const gameIni = this._generateGameIni(server, config);
    fs.writeFileSync(path.join(configDir, 'Game.ini'), gameIni);

    // GameUserSettings.ini — NIE nadpisuj! Tylko dopisz/zaktualizuj ActiveMods
    // w istniejącej sekcji [ServerSettings] (chroni ustawienia gracza przed utratą).
    this._ensureActiveModsInConfig(server);
  }

  /** Dopisuje/aktualizuje ActiveMods w GameUserSettings.ini [ServerSettings] bez ruszania reszty pliku. */
  _ensureActiveModsInConfig(server) {
    try {
      const configDir = path.join(server.install_path, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
      const gusPath = path.join(configDir, 'GameUserSettings.ini');
      if (!fs.existsSync(gusPath)) return;
      let mods = [];
      try {
        mods = this.db.query('SELECT mod_id FROM server_mods WHERE server_id = ? AND active = 1', [server.id]);
      } catch (_) {}
      const modsLine = `ActiveMods=${mods.map(m => m.mod_id).join(',')}`;
      let lines = fs.readFileSync(gusPath, 'utf8').split(/\r?\n/);
      lines = lines.filter(l => !/^\s*ActiveMods\s*=/.test(l));
      if (mods.length > 0) {
        const ssIdx = lines.findIndex(l => /^\s*\[ServerSettings\]\s*$/i.test(l));
        if (ssIdx >= 0) lines.splice(ssIdx + 1, 0, modsLine);
        else { lines.push('', '[ServerSettings]', modsLine); }
      }
      fs.writeFileSync(gusPath, lines.join('\r\n'));
    } catch (e) {
      console.error('[ConfigParser] _ensureActiveModsInConfig failed:', e.message);
    }
  }

  _generateGameIni(server, config) {
    const lines = [];
    const isASA = server.game_type === 'ASA';

    // Read existing if available to merge
    let existing = {};
    const configDir = path.join(server.install_path, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
    const existingPath = path.join(configDir, 'Game.ini');
    if (fs.existsSync(existingPath)) {
      existing = this._parseIni(fs.readFileSync(existingPath, 'utf8'));
    }

    // Merge our config into existing (MERGE MODE!)
    const merged = this._deepMerge({}, existing);

    // [/Script/ShooterGame.ShooterGameMode]
    const shooterGame = merged['/Script/ShooterGame.ShooterGameMode'] || {};
    const rules = config.rules || {};

    const gameModeMappings = {
      DifficultyOffset: 'DifficultyOffset',
      OverrideOfficialDifficulty: 'OverrideOfficialDifficulty',
      MaxTamedDinos: 'MaxTamedDinos',
      MaxStructuresInRange: 'MaxStructuresInRange',
      DayCycleSpeedScale: 'DayCycleSpeedScale',
      DayTimeSpeedScale: 'DayTimeSpeedScale',
      NightTimeSpeedScale: 'NightTimeSpeedScale',
      TamingSpeedMultiplier: 'TamingSpeedMultiplier',
      HarvestAmountMultiplier: 'HarvestAmountMultiplier',
      XPMultiplier: 'XPMultiplier',
      ResourcesRespawnPeriodMultiplier: 'ResourcesRespawnPeriodMultiplier',
      BabyMatureSpeedMultiplier: 'BabyMatureSpeedMultiplier',
      EggHatchSpeedMultiplier: 'EggHatchSpeedMultiplier',
      MatingIntervalMultiplier: 'MatingIntervalMultiplier',
      BabyCuddleIntervalMultiplier: 'BabyCuddleIntervalMultiplier',
      BabyImprintingStatScaleMultiplier: 'BabyImprintingStatScaleMultiplier',
      CropGrowthSpeedMultiplier: 'CropGrowthSpeedMultiplier',
      bUseSingleplayerSettings: 'bUseSingleplayerSettings',
      bDisableStructurePlacementCollision: 'bDisableStructurePlacementCollision',
    };

    for (const [configKey, iniKey] of Object.entries(gameModeMappings)) {
      if (rules[configKey] !== undefined) {
        shooterGame[iniKey] = rules[configKey];
      }
    }

    merged['/Script/ShooterGame.ShooterGameMode'] = shooterGame;

    // Convert merged back to INI
    let iniOutput = '';
    for (const [section, values] of Object.entries(merged)) {
      iniOutput += `[${section}]\n`;
      for (const [key, value] of Object.entries(values)) {
        if (typeof value === 'boolean') {
          iniOutput += `${key}=${value ? 'True' : 'False'}\n`;
        } else if (typeof value === 'object') {
          iniOutput += `${key}=${JSON.stringify(value)}\n`;
        } else {
          iniOutput += `${key}=${value}\n`;
        }
      }
      iniOutput += '\n';
    }

    // ModInstaller — automatyczne pobieranie modów (ASE, razem z flagą -automanagedmods)
    try {
      const mods = this.db.query('SELECT mod_id FROM server_mods WHERE server_id = ? AND active = 1', [server.id]);
      if (mods.length > 0) {
        iniOutput += '[ModInstaller]\n';
        for (const m of mods) iniOutput += `ModIDS=${m.mod_id}\n`;
        iniOutput += '\n';
      }
    } catch (_) {}

    return iniOutput;
  }

  _generateGameUserSettingsIni(server, config) {
    const isASA = server.game_type === 'ASA';
    const configDir = path.join(server.install_path, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
    const existingPath = path.join(configDir, 'GameUserSettings.ini');

    // MERGE MODE: zachowaj istniejący plik (zwłaszcza [ServerSettings] z ustawieniami gracza)
    let existing = {};
    if (fs.existsSync(existingPath)) {
      try { existing = this._parseIni(fs.readFileSync(existingPath, 'utf8')); } catch (_) {}
    }
    const merged = this._deepMerge({}, existing);

    const admin = config.administration || {};

    // [ServerSettings] — aktualizuj klucze zarządzane przez aplikację, resztę ZACHOWAJ
    const ss = merged['ServerSettings'] || {};
    if (admin.ServerAdminPassword) ss.ServerAdminPassword = admin.ServerAdminPassword;
    if (admin.ServerPassword) ss.ServerPassword = admin.ServerPassword;
    ss.MaxPlayers = admin.MaxPlayers || server.max_players || ss.MaxPlayers || 70;
    if (server.name) ss.SessionName = server.name;
    ss.Port = server.port || ss.Port || 7790;
    ss.QueryPort = server.query_port || ss.QueryPort || 27017;
    ss.RCONPort = server.rcon_port || ss.RCONPort || 32330;
    ss.RCONEnabled = 'True';
    ss.RCONServerGameLogBuffer = ss.RCONServerGameLogBuffer || 600;
    if (server.cluster_id) ss.ClusterDirOverride = server.cluster_id;
    if (admin.ServerPVE !== undefined) ss.ServerPVE = admin.ServerPVE ? 'True' : 'False';
    if (admin.ServerCrosshair !== undefined) ss.ServerCrosshair = admin.ServerCrosshair ? 'True' : 'False';
    if (admin.ShowMapPlayerLocation !== undefined) ss.ShowMapPlayerLocation = admin.ShowMapPlayerLocation ? 'True' : 'False';
    if (admin.AllowThirdPersonPlayer !== undefined) ss.AllowThirdPersonPlayer = admin.AllowThirdPersonPlayer ? 'True' : 'False';
    if (isASA) {
      ss.bServerGamepadCausesPause = 'False';
      ss.bServerGamepadBlockConsole = 'False';
    }

    // ActiveMods — TYLKO tutaj (ARK czyta mody z GameUserSettings.ini [ServerSettings])
    try {
      const mods = this.db.query('SELECT mod_id FROM server_mods WHERE server_id = ? AND active = 1', [server.id]);
      if (mods.length > 0) {
        ss.ActiveMods = mods.map(m => m.mod_id).join(',');
      } else {
        delete ss.ActiveMods;
      }
    } catch (_) {}

    merged['ServerSettings'] = ss;

    // Serializuj
    let iniOutput = '';
    for (const [section, values] of Object.entries(merged)) {
      iniOutput += `[${section}]\n`;
      for (const [key, value] of Object.entries(values)) {
        if (typeof value === 'boolean') iniOutput += `${key}=${value ? 'True' : 'False'}\n`;
        else if (typeof value === 'object') iniOutput += `${key}=${JSON.stringify(value)}\n`;
        else iniOutput += `${key}=${value}\n`;
      }
      iniOutput += '\n';
    }

    return iniOutput;
  }

  // ═══════════════════════════════════════════════════════════════════
  // GAMEDATA
  // ═══════════════════════════════════════════════════════════════════

  listMaps(gameType) {
    const gamedataDir = this._getGamedataDir();
    if (!fs.existsSync(gamedataDir)) return [];

    const files = fs.readdirSync(gamedataDir).filter(f => f.endsWith('.gamedata'));
    return files.map(f => {
      const data = this._loadGamedata(f);
      return {
        fileName: f,
        mapName: f.replace('.gamedata', ''),
        application: data?.Application,
        version: data?.Version,
        hasCreatures: !!(data?.Creatures?.length),
        hasEngrams: !!(data?.Engrams?.length),
        hasItems: !!(data?.Items?.length),
        hasMapSpawners: !!(data?.MapSpawners?.length),
      };
    });
  }

  getMapData(mapName) {
    const fileName = `${mapName}.gamedata`;
    return this._loadGamedata(fileName);
  }

  getCreatures(mapName) {
    const data = this.getMapData(mapName);
    return data?.Creatures || [];
  }

  getEngrams(mapName) {
    const data = this.getMapData(mapName);
    return data?.Engrams || [];
  }

  getItems(mapName) {
    const data = this.getMapData(mapName);
    return data?.Items || [];
  }

  /** Katalog itemów do give-item (data/items-catalog.json) — GFI + kategoria + nazwa */
  getItemsCatalog() {
    const { app } = require('electron');
    const isDev = !app?.isPackaged;
    const dataDir = isDev ? path.join(__dirname, '..', '..', 'data') : path.join(process.resourcesPath, 'data');
    const filePath = path.join(dataDir, 'items-catalog.json');
    if (!fs.existsSync(filePath)) return [];
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      console.error('[ConfigParser] Error loading items catalog:', e.message);
      return [];
    }
  }

  // ── Internal ──
  _getGamedataDir() {
    const { app } = require('electron');
    const isDev = !app?.isPackaged;
    if (isDev) {
      return path.join(__dirname, '..', '..', 'data', 'gamedata');
    }
    // Packaged: check AppData first
    const appData = path.join(app.getPath('appData'), 'ArkAdminManager', 'gamedata');
    if (fs.existsSync(appData)) return appData;
    return path.join(process.resourcesPath, 'data', 'gamedata');
  }

  _loadGamedata(fileName) {
    if (this.gamedataCache.has(fileName)) {
      return this.gamedataCache.get(fileName);
    }

    const filePath = path.join(this._getGamedataDir(), fileName);
    if (!fs.existsSync(filePath)) return null;

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      this.gamedataCache.set(fileName, data);
      return data;
    } catch (e) {
      console.error(`[ConfigParser] Error loading gamedata ${fileName}:`, e.message);
      return null;
    }
  }

  _parseIni(content) {
    const result = {};
    let currentSection = null;

    const lines = content.split('\n');
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith(';') || line.startsWith('#')) continue;

      const sectionMatch = line.match(/^\[(.+)\]$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1];
        if (!result[currentSection]) result[currentSection] = {};
        continue;
      }

      const kvMatch = line.match(/^([^=]+)=(.*)$/);
      if (kvMatch && currentSection) {
        let key = kvMatch[1].trim();
        let value = kvMatch[2].trim();

        // Convert types
        if (value === 'True') value = true;
        else if (value === 'False') value = false;
        else if (/^-?\d+$/.test(value)) value = parseInt(value, 10);
        else if (/^-?\d+\.\d+$/.test(value)) value = parseFloat(value);

        result[currentSection][key] = value;
      }
    }

    return result;
  }

  _deepMerge(target, source) {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        this._deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }
}

module.exports = ConfigParser;
