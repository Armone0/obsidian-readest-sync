# Readest Sync (`obsidian-readest-sync`)

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Community%20Plugin-7C3AED?logo=obsidian&logoColor=white)](https://obsidian.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Readest Compatible](https://img.shields.io/badge/Readest-v0.9+-059669?logo=book&logoColor=white)](https://github.com/readest/readest)

**Readest Sync** is a production-grade, local-first Obsidian plugin that seamlessly syncs books, highlights, annotations, reading progress, and covers from the open-source [Readest](https://github.com/readest/readest) e-book reader directly into your Obsidian vault.

Like Readwise, but **100% free, local-first, and private**. No cloud subscription or third-party server required.

---

## ✨ Features

- 🔍 **One-Click Auto-Detection**: Automatically discovers your local Readest library on Windows (`%APPDATA%`), macOS (`Application Support`), and Linux (`~/.local/share`).
- 📚 **Comprehensive Metadata**: Extracts title, author, format (`EPUB`, `PDF`, `MOBI`, `CBZ`, etc.), reading status, tags, and reading progress.
- 🖼️ **Book Covers**: Extracts and embeds book cover images directly into your vault notes.
- 📊 **Visual Progress Bar**: Renders clean ASCII visual progress indicators:  
  `Progress: 47% [████████░░░░░░░░] (Page 942 of 1996)`
- 🎨 **Flexible Highlight Presentation**:
  - **Obsidian Callouts**: `> [!quote]` with color matching (`yellow`, `red`, `green`, `blue`, `violet`).
  - **Standard Blockquotes**: Minimal markdown quotes.
  - **Bullet Lists**: Compact outline style.
  - Color tagging (`#highlight/yellow`, `#highlight/green`, etc.).
- 📖 **Chapter & Date Grouping**: Organizes highlights by book chapter (from EPUB navigation) or chronologically by date.
- 🛡️ **Non-Destructive Safe Sync**: Preserves your personal reviews, reflections, custom tags, and edits outside generated blocks. Readest Sync will **never** overwrite your personal notes!
- 📦 **Universal Import Modal**:
  - `.readestpack` / `.rbooks` collection packages.
  - Readest `.zip` backup archives.
  - SQLite databases (`statistics.db`, `.db`, `.sqlite`).
  - Readest annotation JSON exports (`$format: "readest-annotations"`).
- ⏱️ **Flexible Automation**: Sync manually, automatically on Obsidian startup, or periodically every 15, 30, or 60 minutes.

---

## 📸 Sample Generated Book Note

```markdown
---
title: "Dune"
author: "Frank Herbert"
format: EPUB
readingStatus: reading
progress: "64%"
totalHighlights: 12
lastSynced: "2026-10-24 14:30:00"
bookHash: "8f7e2a1b9c3d4e5f60718293a4b5c6d7"
tags:
  - readest
  - reading/currently-reading
  - science-fiction
---

# Dune
**Author**: [[Frank Herbert]]

![Book Cover|180](Readest/Covers/Dune_8f7e2a1b.png)

> [!info]+ Book Details
> - **Format**: EPUB
> - **Status**: `READING`
> - **Progress**: 64% `██████████░░░░░░` *(Page 412 of 644)*
> - **Highlights & Notes**: 12

## 📝 My Personal Notes & Reflections

> [!tip] User Note Area
> Feel free to write your personal summary, takeaways, or review below.
> *Readest Sync will never overwrite or erase your notes written in this section!*

A masterpiece on ecology, power, and religious politics. The world-building of Arrakis is unmatched.

---

<!-- readest-sync-highlights-start -->
## 📚 Highlights & Annotations

### 📖 Chapter 1: The Gom Jabbar

> [!quote|yellow] Chapter 1
> I must not fear. Fear is the mind-killer. Fear is the little-death that brings total obliteration. I will face my fear.
> 
> 💬 **Note**: The Litany Against Fear.
> 
> *Page 8 • 2026-10-15 19:42 • #highlight/yellow*

<!-- readest-sync-highlights-end -->
```

---

## 🚀 Quick Start Guide

### 1. Installation

#### Option A: Obsidian Community Plugins (Recommended)
1. In Obsidian, go to **Settings** > **Community plugins**.
2. Turn off **Restricted mode**.
3. Search for **Readest Sync** and click **Install**, then **Enable**.

#### Option B: Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [Release](https://github.com/Armone0/obsidian-readest-sync/releases/latest).
2. Inside your Obsidian vault, navigate to `.obsidian/plugins/`.
3. Create a new folder named `obsidian-readest-sync`.
4. Copy `main.js`, `manifest.json`, and `styles.css` into that folder.
5. In Obsidian, reload plugins and enable **Readest Sync**.

---

### 2. Configuration & First Sync

1. Open **Settings** > **Readest Sync**.
2. Click **🔍 Auto-Detect**. If Readest is installed locally, the path will be filled automatically!
3. Click the **Book Open** ribbon icon in the left sidebar, or open the Command Palette (`Ctrl/Cmd + P`) and run:
   ```text
   Readest Sync: Sync books and highlights now
   ```
4. All your books, reading progress, and annotations will be neatly organized in your `Readest/` folder.

---

## ⚙️ Settings Reference

| Setting | Default | Description |
| :--- | :--- | :--- |
| **Readest Data Path** | Auto-detected | Path to Readest directory containing `library.json` and `Books/`. |
| **Books Folder** | `Readest` | Vault folder where book notes will be created. |
| **Include Cover Images** | `true` | Save and display book covers from Readest. |
| **Covers Folder** | `Readest/Covers` | Subfolder in vault for storing cover image files. |
| **Note File Naming** | `Book Title` | File naming pattern (`Title`, `Title - Author`, `Author - Title`). |
| **Sync Frequency** | `Manual` | Automatic sync interval (`Manual`, `Startup`, `15m`, `30m`, `60m`). |
| **Highlight Presentation** | `Callout` | Visual style (`Callout > [!quote]`, `Blockquote`, `Bullet List`). |
| **Colorized Callouts** | `true` | Matches callout theme color to the highlight color in Readest. |
| **Color Tags** | `true` | Appends tags like `#highlight/yellow`, `#highlight/red`. |
| **Group Highlights By** | `Chapter` | Grouping order (`Chapter / Section`, `Date`, `Linear`). |
| **Preserve User Notes** | `true` | Protects custom writing outside the highlights sync delimiters. |

---

## 📦 Importing Bundles & Export Files

If you use Readest on mobile or another device, you can easily transfer your data:

1. In Readest, export your library or annotations:
   - Export collection as `.rbooks` (or `.readestpack`).
   - Or export highlights as **JSON (Readest)**.
2. In Obsidian, run the command:
   ```text
   Readest Sync: Import .rbooks / .readestpack bundle or JSON
   ```
3. Drag and drop your file or paste the JSON text directly.
4. Your books and highlights will be imported instantly!

---

## 🛡️ Safe Sync Guarantee

Readest Sync is engineered with safety as a primary principle:
- Highlights are placed inside `<!-- readest-sync-highlights-start -->` and `<!-- readest-sync-highlights-end -->`.
- Any sections above or below these tags (such as your personal notes, summaries, or custom frontmatter properties) are **intact and preserved** during updates.
- Updates are idempotent: re-syncing never creates duplicate notes or corrupts existing content.

---

## 🛠️ Development & Building

To build the plugin locally:

```bash
git clone https://github.com/Armone0/obsidian-readest-sync.git
cd obsidian-readest-sync
npm install
npm run build
```

The output `main.js` will be compiled into the root directory.

---

## 📄 License

MIT License © 2026 Armone0. Built for the [Readest](https://github.com/readest/readest) and [Obsidian](https://obsidian.md) community.
