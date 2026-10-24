import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type ReadestSyncPlugin from '../main';
import { checkReadestPath, autoDetectReadestPath, isNodeAvailable } from '../utils/pathUtils';
import { SyncStatsModal } from './syncStatsModal';
import { ReadestImportModal } from './importModal';

export class ReadestSyncSettingTab extends PluginSettingTab {
  plugin: ReadestSyncPlugin;

  constructor(app: App, plugin: ReadestSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('readest-settings-tab');

    // Header
    const header = containerEl.createDiv({ cls: 'readest-settings-header' });
    header.createEl('h2', { text: 'Readest Sync Settings' });
    header.createEl('p', {
      text: 'Sync your e-book highlights, annotations, reading progress, and book metadata from the Readest reader into your Obsidian vault.',
      cls: 'readest-settings-subtitle',
    });

    // 1. Data Source & Path
    containerEl.createEl('h3', { text: '📁 Readest Data Source' });

    const pathSetting = new Setting(containerEl)
      .setName('Readest Data Path')
      .setDesc('Path to Readest data directory (containing library.json and Books folder).')
      .addText((text) => {
        text.setPlaceholder('C:\\Users\\...\\AppData\\Roaming\\com.bilingify.readest\\Readest')
          .setValue(this.plugin.settings.readestDataPath)
          .onChange(async (val) => {
            this.plugin.settings.readestDataPath = val.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.style.width = '100%';
      });

    if (isNodeAvailable()) {
      pathSetting.addButton((btn) => {
        btn.setButtonText('🔍 Auto-Detect')
          .setTooltip('Search standard Readest install directories on your system')
          .onClick(async () => {
            const detected = autoDetectReadestPath();
            if (detected && detected.isValid) {
              this.plugin.settings.readestDataPath = detected.basePath;
              await this.plugin.saveSettings();
              new Notice(`Readest found! Detected ${detected.bookCount ?? 0} books.`);
              this.display();
            } else {
              new Notice('Could not automatically locate Readest data folder. Please specify the path manually.');
            }
          });
      });

      pathSetting.addButton((btn) => {
        btn.setButtonText('⚡ Test Connection')
          .onClick(() => {
            const pathInfo = checkReadestPath(this.plugin.settings.readestDataPath);
            if (pathInfo.isValid) {
              new Notice(`✅ Valid Readest directory! Detected ${pathInfo.bookCount ?? 0} books.`);
            } else {
              new Notice('❌ Invalid path. Could not locate library.json in this directory.');
            }
          });
      });
    }

    // 2. Vault Location
    containerEl.createEl('h3', { text: '📂 Vault Destination' });

    new Setting(containerEl)
      .setName('Books Folder')
      .setDesc('Folder in your Obsidian vault where book notes will be created.')
      .addText((text) => {
        text.setPlaceholder('Readest')
          .setValue(this.plugin.settings.booksFolder)
          .onChange(async (val) => {
            this.plugin.settings.booksFolder = val.trim() || 'Readest';
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Include Cover Images')
      .setDesc('Save book cover images from Readest into your vault and display them on notes.')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.includeCoverImage)
          .onChange(async (val) => {
            this.plugin.settings.includeCoverImage = val;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    if (this.plugin.settings.includeCoverImage) {
      new Setting(containerEl)
        .setName('Covers Folder')
        .setDesc('Folder in your vault to store book cover images.')
        .addText((text) => {
          text.setPlaceholder('Readest/Covers')
            .setValue(this.plugin.settings.coversFolder)
            .onChange(async (val) => {
              this.plugin.settings.coversFolder = val.trim() || 'Readest/Covers';
              await this.plugin.saveSettings();
            });
        });
    }

    new Setting(containerEl)
      .setName('Note File Naming')
      .setDesc('Naming scheme for generated book notes.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('title', 'Book Title (e.g., Dune)')
          .addOption('title-author', 'Title - Author (e.g., Dune - Frank Herbert)')
          .addOption('author-title', 'Author - Title (e.g., Frank Herbert - Dune)')
          .setValue(this.plugin.settings.fileNaming)
          .onChange(async (val: string) => {
            this.plugin.settings.fileNaming = val as 'title' | 'title-author' | 'author-title';
            await this.plugin.saveSettings();
          });
      });

    // 3. Sync & Scheduling
    containerEl.createEl('h3', { text: '⏱️ Sync & Automation' });

    new Setting(containerEl)
      .setName('Sync Frequency')
      .setDesc('How often Readest Sync automatically syncs in the background.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('manual', 'Manual only')
          .addOption('startup', 'On Obsidian startup')
          .addOption('15m', 'Every 15 minutes')
          .addOption('30m', 'Every 30 minutes')
          .addOption('60m', 'Every 1 hour')
          .setValue(this.plugin.settings.syncFrequency)
          .onChange(async (val: string) => {
            this.plugin.settings.syncFrequency = val as 'manual' | 'startup' | '15m' | '30m' | '60m';
            await this.plugin.saveSettings();
            this.plugin.setupPeriodicSync();
          });
      });

    new Setting(containerEl)
      .setName('Sync Only Books with Notes / Progress')
      .setDesc('Skip books that have no highlights, annotations, or reading progress recorded.')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.syncOnlyWithNotes)
          .onChange(async (val) => {
            this.plugin.settings.syncOnlyWithNotes = val;
            await this.plugin.saveSettings();
          });
      });

    // 4. Formatting & Style
    containerEl.createEl('h3', { text: '🎨 Formatting & Styling' });

    new Setting(containerEl)
      .setName('Highlight Presentation')
      .setDesc('Visual format for highlights inside the note.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('callout', 'Obsidian Callout (> [!quote])')
          .addOption('blockquote', 'Standard Blockquote (> text)')
          .addOption('bullet', 'Bullet List (- item)')
          .setValue(this.plugin.settings.highlightStyle)
          .onChange(async (val: string) => {
            this.plugin.settings.highlightStyle = val as 'callout' | 'blockquote' | 'bullet';
            await this.plugin.saveSettings();
            this.display();
          });
      });

    if (this.plugin.settings.highlightStyle === 'callout') {
      new Setting(containerEl)
        .setName('Callout Type')
        .setDesc('Callout type name (e.g. quote, note, readest, info).')
        .addText((text) => {
          text.setValue(this.plugin.settings.calloutType)
            .onChange(async (val) => {
              this.plugin.settings.calloutType = val.trim() || 'quote';
              await this.plugin.saveSettings();
            });
        });

      new Setting(containerEl)
        .setName('Colorized Callouts')
        .setDesc('Add color badge / suffix to callouts based on highlight color.')
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.colorCallouts)
            .onChange(async (val) => {
              this.plugin.settings.colorCallouts = val;
              await this.plugin.saveSettings();
            });
        });
    }

    new Setting(containerEl)
      .setName('Include Color Tags')
      .setDesc('Append tags like #highlight/yellow, #highlight/red to highlights.')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.colorTags)
          .onChange(async (val) => {
            this.plugin.settings.colorTags = val;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Group Highlights By')
      .setDesc('How highlights are structured within the note.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('chapter', 'Chapter / Section')
          .addOption('date', 'Highlight Date')
          .addOption('none', 'Linear (Order of appearance)')
          .setValue(this.plugin.settings.groupHighlightsBy)
          .onChange(async (val: string) => {
            this.plugin.settings.groupHighlightsBy = val as 'chapter' | 'date' | 'none';
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Timestamp Format')
      .setDesc('Format string for dates and times.')
      .addText((text) => {
        text.setValue(this.plugin.settings.dateFormat)
          .onChange(async (val) => {
            this.plugin.settings.dateFormat = val.trim() || 'YYYY-MM-DD HH:mm';
            await this.plugin.saveSettings();
          });
      });

    // 5. Data Safety
    containerEl.createEl('h3', { text: '🛡️ Non-Destructive Safe Sync' });

    new Setting(containerEl)
      .setName('Preserve User Notes & Custom Edits')
      .setDesc('Never overwrite your personal notes, summaries, or custom frontmatter fields written in your book notes.')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.preserveUserNotes)
          .onChange(async (val) => {
            this.plugin.settings.preserveUserNotes = val;
            await this.plugin.saveSettings();
          });
      });

    // 6. Action Center
    containerEl.createEl('h3', { text: '⚡ Actions' });

    new Setting(containerEl)
      .setName('Sync Now')
      .setDesc('Immediately pull all updates from your Readest library.')
      .addButton((btn) => {
        btn.setButtonText('🔄 Sync Readest Now')
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true);
            btn.setButtonText('Syncing...');
            try {
              const result = await this.plugin.syncEngine.syncFromLocalFolder();
              this.plugin.settings.lastSyncTime = Date.now();
              this.plugin.settings.lastSyncStats = {
                totalBooks: result.booksProcessed,
                syncedBooks: result.booksCreated + result.booksUpdated,
                totalHighlights: result.highlightsSynced,
              };
              await this.plugin.saveSettings();
              new SyncStatsModal(this.app, result, this.plugin.settings.booksFolder).open();
            } catch (err) {
              new Notice(`Sync failed: ${(err as Error).message}`);
            } finally {
              btn.setDisabled(false);
              btn.setButtonText('🔄 Sync Readest Now');
            }
          });
      });

    new Setting(containerEl)
      .setName('Import Pack / Export File')
      .setDesc('Manually import a .readestpack, .rbooks, .zip, SQLite database, or exported JSON.')
      .addButton((btn) => {
        btn.setButtonText('📦 Import Bundle / JSON')
          .onClick(() => {
            new ReadestImportModal(this.app, this.plugin.settings).open();
          });
      });
  }
}
