import { App, Modal, Notice, Setting } from 'obsidian';
import { SyncEngine } from '../engine/syncEngine';
import { ReadestSyncSettings } from '../types/settings';

export class ReadestImportModal extends Modal {
  private settings: ReadestSyncSettings;
  private syncEngine: SyncEngine;
  private selectedFile: File | null = null;
  private jsonText = '';
  private activeTab: 'file' | 'text' = 'file';

  constructor(app: App, settings: ReadestSyncSettings) {
    super(app);
    this.settings = settings;
    this.syncEngine = new SyncEngine(app, settings);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('readest-import-modal');

    contentEl.createEl('h2', { text: 'Import from Readest' });
    contentEl.createEl('p', {
      text: 'Import books, annotations, and reading progress directly from a .readestpack, .rbooks, .zip archive, SQLite database, or exported JSON.',
      cls: 'readest-modal-desc',
    });

    // Tab buttons
    const tabsContainer = contentEl.createDiv({ cls: 'readest-tabs' });
    const fileTabBtn = tabsContainer.createEl('button', {
      text: '📁 File (.readestpack / .json / .db)',
      cls: `readest-tab-btn ${this.activeTab === 'file' ? 'active' : ''}`,
    });
    const textTabBtn = tabsContainer.createEl('button', {
      text: '📋 Paste JSON',
      cls: `readest-tab-btn ${this.activeTab === 'text' ? 'active' : ''}`,
    });

    const bodyContainer = contentEl.createDiv({ cls: 'readest-modal-body' });

    const renderTabs = () => {
      bodyContainer.empty();
      fileTabBtn.toggleClass('active', this.activeTab === 'file');
      textTabBtn.toggleClass('active', this.activeTab === 'text');

      if (this.activeTab === 'file') {
        this.renderFileTab(bodyContainer);
      } else {
        this.renderTextTab(bodyContainer);
      }
    };

    fileTabBtn.addEventListener('click', () => {
      this.activeTab = 'file';
      renderTabs();
    });

    textTabBtn.addEventListener('click', () => {
      this.activeTab = 'text';
      renderTabs();
    });

    renderTabs();
  }

  private renderFileTab(container: HTMLElement) {
    const dropZone = container.createDiv({ cls: 'readest-drop-zone' });
    const dropText = dropZone.createEl('div', { cls: 'readest-drop-text' });
    dropText.createEl('span', { text: '📥 Drag & drop Readest file here, or click to browse', cls: 'readest-drop-title' });
    dropText.createEl('span', { text: 'Supports .readestpack, .rbooks, .zip, .json, .sqlite, .db', cls: 'readest-drop-sub' });

    const fileInput = dropZone.createEl('input', {
      type: 'file',
      cls: 'readest-hidden-input',
    });
    fileInput.accept = '.readestpack,.rbooks,.zip,.json,.sqlite,.db';

    const selectedFileDisplay = container.createDiv({ cls: 'readest-selected-file' });
    selectedFileDisplay.style.display = 'none';

    const updateFileDisplay = (file: File) => {
      this.selectedFile = file;
      selectedFileDisplay.empty();
      selectedFileDisplay.style.display = 'flex';
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      selectedFileDisplay.createEl('span', { text: `📄 ${file.name} (${sizeMb} MB)`, cls: 'readest-file-info' });
    };

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        updateFileDisplay(fileInput.files[0]);
      }
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.addClass('hover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.removeClass('hover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.removeClass('hover');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        updateFileDisplay(e.dataTransfer.files[0]);
      }
    });

    // Action button
    const actions = container.createDiv({ cls: 'readest-modal-actions' });
    const cancelBtn = actions.createEl('button', { text: 'Cancel', cls: 'mod-cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const importBtn = actions.createEl('button', { text: 'Start Import', cls: 'mod-cta' });
    importBtn.addEventListener('click', async () => {
      if (!this.selectedFile) {
        new Notice('Please select a file to import.');
        return;
      }
      importBtn.disabled = true;
      importBtn.setText('Importing...');

      try {
        await this.handleFileImport(this.selectedFile);
        this.close();
      } catch (err) {
        new Notice(`Import failed: ${(err as Error).message}`);
        importBtn.disabled = false;
        importBtn.setText('Start Import');
      }
    });
  }

  private renderTextTab(container: HTMLElement) {
    const textSetting = new Setting(container)
      .setName('Raw JSON Content')
      .setDesc('Paste exported Readest annotation JSON or library JSON.')
      .addTextArea((text) => {
        text.setPlaceholder('{"$format": "readest-annotations", ...}')
          .setValue(this.jsonText)
          .onChange((val) => {
            this.jsonText = val;
          });
        text.inputEl.rows = 8;
        text.inputEl.style.width = '100%';
        text.inputEl.style.fontFamily = 'monospace';
      });
    textSetting.settingEl.style.display = 'block';

    const actions = container.createDiv({ cls: 'readest-modal-actions' });
    const cancelBtn = actions.createEl('button', { text: 'Cancel', cls: 'mod-cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const importBtn = actions.createEl('button', { text: 'Import JSON', cls: 'mod-cta' });
    importBtn.addEventListener('click', async () => {
      if (!this.jsonText.trim()) {
        new Notice('Please paste JSON content to import.');
        return;
      }

      importBtn.disabled = true;
      importBtn.setText('Importing...');

      try {
        const result = await this.syncEngine.syncFromJsonString(this.jsonText);
        new Notice(`Readest Sync: Successfully imported ${result.booksCreated + result.booksUpdated} books and ${result.highlightsSynced} highlights!`);
        this.close();
      } catch (err) {
        new Notice(`Import error: ${(err as Error).message}`);
        importBtn.disabled = false;
        importBtn.setText('Import JSON');
      }
    });
  }

  private async handleFileImport(file: File) {
    const name = file.name.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();

    let result;
    if (name.endsWith('.json')) {
      const text = new TextDecoder('utf-8').decode(arrayBuffer);
      result = await this.syncEngine.syncFromJsonString(text);
    } else if (name.endsWith('.sqlite') || name.endsWith('.db')) {
      result = await this.syncEngine.syncFromSqliteBuffer(arrayBuffer);
    } else {
      // .readestpack, .rbooks, .zip
      result = await this.syncEngine.syncFromPackBuffer(arrayBuffer, file.name);
    }

    new Notice(
      `Readest Sync: Processed ${result.booksProcessed} books. Created ${result.booksCreated}, updated ${result.booksUpdated}, synced ${result.highlightsSynced} highlights in ${result.durationMs}ms.`
    );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
