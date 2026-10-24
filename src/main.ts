import { Notice, Plugin, TFolder, normalizePath } from 'obsidian';
import { DEFAULT_SETTINGS, ReadestSyncSettings } from './types/settings';
import { SyncEngine } from './engine/syncEngine';
import { ReadestSyncSettingTab } from './ui/settingTab';
import { ReadestImportModal } from './ui/importModal';
import { SyncStatsModal } from './ui/syncStatsModal';
import { autoDetectReadestPath } from './utils/pathUtils';

export default class ReadestSyncPlugin extends Plugin {
  settings: ReadestSyncSettings = DEFAULT_SETTINGS;
  syncEngine: SyncEngine = new SyncEngine(this.app, this.settings);
  private syncIntervalId: number | null = null;

  async onload() {
    await this.loadSettings();

    // Auto-detect Readest path if not yet configured
    if (!this.settings.readestDataPath) {
      const detected = autoDetectReadestPath();
      if (detected && detected.isValid) {
        this.settings.readestDataPath = detected.basePath;
        await this.saveSettings();
        console.log(`[ReadestSync] Auto-detected Readest data path at: ${detected.basePath}`);
      }
    }

    this.syncEngine = new SyncEngine(this.app, this.settings);

    // 1. Add Ribbon Icon
    this.addRibbonIcon('book-open', 'Readest Sync: Sync books and highlights', async () => {
      await this.runSync(true);
    });

    // 2. Register Command Palette Commands
    this.addCommand({
      id: 'readest-sync-now',
      name: 'Sync books and highlights now',
      callback: async () => {
        await this.runSync(true);
      },
    });

    this.addCommand({
      id: 'readest-import-pack',
      name: 'Import .rbooks / .readestpack bundle or JSON',
      callback: () => {
        new ReadestImportModal(this.app, this.settings).open();
      },
    });

    this.addCommand({
      id: 'readest-autodetect-path',
      name: 'Auto-detect Readest data folder',
      callback: async () => {
        const detected = autoDetectReadestPath();
        if (detected && detected.isValid) {
          this.settings.readestDataPath = detected.basePath;
          await this.saveSettings();
          new Notice(`Readest Sync: Successfully located Readest directory with ${detected.bookCount ?? 0} books!`);
        } else {
          new Notice('Readest Sync: Could not auto-detect Readest directory. Please set it in Settings.');
        }
      },
    });

    this.addCommand({
      id: 'readest-open-books-folder',
      name: 'Open Readest books folder in vault',
      callback: () => {
        const folder = this.app.vault.getAbstractFileByPath(normalizePath(this.settings.booksFolder));
        if (folder instanceof TFolder) {
          // Highlight/expand folder in file explorer
          const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
          if (fileExplorer) {
            this.app.workspace.revealLeaf(fileExplorer);
          }
        } else {
          new Notice(`Folder "${this.settings.booksFolder}" does not exist yet. Run a sync first!`);
        }
      },
    });

    // 3. Register Setting Tab
    this.addSettingTab(new ReadestSyncSettingTab(this.app, this));

    // 4. Setup periodic sync schedule
    this.setupPeriodicSync();

    // 5. Check if startup sync is requested
    if (this.settings.syncFrequency === 'startup') {
      this.app.workspace.onLayoutReady(() => {
        setTimeout(() => {
          this.runSync(false);
        }, 3000);
      });
    }

    console.log('[ReadestSync] Readest Sync Plugin loaded.');
  }

  onunload() {
    this.clearPeriodicSync();
    console.log('[ReadestSync] Readest Sync Plugin unloaded.');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.syncEngine = new SyncEngine(this.app, this.settings);
  }

  public setupPeriodicSync() {
    this.clearPeriodicSync();

    if (this.settings.syncFrequency === 'manual' || this.settings.syncFrequency === 'startup') {
      return;
    }

    let intervalMs = 30 * 60 * 1000;
    if (this.settings.syncFrequency === '15m') intervalMs = 15 * 60 * 1000;
    else if (this.settings.syncFrequency === '30m') intervalMs = 30 * 60 * 1000;
    else if (this.settings.syncFrequency === '60m') intervalMs = 60 * 60 * 1000;

    // Use window.setInterval
    this.syncIntervalId = window.setInterval(async () => {
      console.log('[ReadestSync] Running scheduled periodic sync...');
      await this.runSync(false);
    }, intervalMs);

    this.registerInterval(this.syncIntervalId);
  }

  private clearPeriodicSync() {
    if (this.syncIntervalId !== null) {
      window.clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  public async runSync(showSummaryModal = true): Promise<void> {
    if (!this.settings.readestDataPath) {
      new Notice('Readest Sync: Please configure your Readest Data Path in plugin settings.');
      return;
    }

    new Notice('Readest Sync: Syncing books and annotations...');

    try {
      const result = await this.syncEngine.syncFromLocalFolder();

      this.settings.lastSyncTime = Date.now();
      this.settings.lastSyncStats = {
        totalBooks: result.booksProcessed,
        syncedBooks: result.booksCreated + result.booksUpdated,
        totalHighlights: result.highlightsSynced,
      };
      await this.saveSettings();

      if (showSummaryModal) {
        new SyncStatsModal(this.app, result, this.settings.booksFolder).open();
      } else {
        new Notice(
          `Readest Sync: Complete! Synced ${result.booksCreated + result.booksUpdated} books, ${result.highlightsSynced} highlights.`
        );
      }
    } catch (err) {
      const message = (err as Error).message;
      new Notice(`Readest Sync Error: ${message}`);
      console.error('[ReadestSync] Sync error:', err);
    }
  }
}
