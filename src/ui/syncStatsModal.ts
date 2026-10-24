import { App, Modal, Setting } from 'obsidian';
import { SyncResult } from '../types/settings';

export class SyncStatsModal extends Modal {
  private result: SyncResult;
  private booksFolder: string;

  constructor(app: App, result: SyncResult, booksFolder: string) {
    super(app);
    this.result = result;
    this.booksFolder = booksFolder;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('readest-stats-modal');

    contentEl.createEl('h2', { text: 'Readest Sync Summary' });

    const grid = contentEl.createDiv({ cls: 'readest-stats-grid' });

    this.createStatCard(grid, '📚 Books Processed', this.result.booksProcessed.toString());
    this.createStatCard(grid, '✨ New Notes Created', this.result.booksCreated.toString());
    this.createStatCard(grid, '🔄 Notes Updated', this.result.booksUpdated.toString());
    this.createStatCard(grid, '💡 Highlights Synced', this.result.highlightsSynced.toString());

    contentEl.createEl('p', {
      text: `Sync finished in ${this.result.durationMs}ms. Target folder: ${this.booksFolder}`,
      cls: 'readest-stats-meta',
    });

    if (this.result.errors.length > 0) {
      const errSection = contentEl.createDiv({ cls: 'readest-stats-errors' });
      errSection.createEl('h3', { text: '⚠️ Warnings & Errors' });
      const errList = errSection.createEl('ul');
      for (const err of this.result.errors) {
        errList.createEl('li', { text: err });
      }
    }

    new Setting(contentEl)
      .addButton((btn) => {
        btn.setButtonText('Close')
          .setCta()
          .onClick(() => this.close());
      });
  }

  private createStatCard(container: HTMLElement, label: string, value: string) {
    const card = container.createDiv({ cls: 'readest-stat-card' });
    card.createEl('span', { text: value, cls: 'readest-stat-val' });
    card.createEl('span', { text: label, cls: 'readest-stat-label' });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
