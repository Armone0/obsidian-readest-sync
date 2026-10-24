export function isNodeAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    return typeof fs?.existsSync === 'function';
  } catch {
    return false;
  }
}

export function getCandidateReadestPaths(): string[] {
  if (!isNodeAvailable()) return [];

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const os = require('os');

  const candidates: string[] = [];
  const home = os.homedir();
  const platform = os.platform();

  if (platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const localappdata = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');

    candidates.push(
      path.join(appdata, 'com.bilingify.readest', 'Readest'),
      path.join(appdata, 'com.bilingify.readest', 'Readest', 'Books'),
      path.join(appdata, 'com.readest.app', 'Readest'),
      path.join(appdata, 'com.readest.app', 'Readest', 'Books'),
      path.join(appdata, 'Readest'),
      path.join(appdata, 'Readest', 'Books'),
      path.join(localappdata, 'com.bilingify.readest', 'Readest'),
      path.join(localappdata, 'Readest'),
      path.join(home, 'Readest')
    );
  } else if (platform === 'darwin') {
    const appSupport = path.join(home, 'Library', 'Application Support');
    candidates.push(
      path.join(appSupport, 'com.bilingify.readest', 'Readest'),
      path.join(appSupport, 'com.bilingify.readest', 'Readest', 'Books'),
      path.join(appSupport, 'com.readest.app', 'Readest'),
      path.join(appSupport, 'Readest'),
      path.join(home, 'Readest')
    );
  } else {
    // Linux and other Unixes
    const xdgData = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
    const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');

    candidates.push(
      path.join(xdgData, 'com.bilingify.readest', 'Readest'),
      path.join(xdgData, 'com.bilingify.readest', 'Readest', 'Books'),
      path.join(xdgData, 'Readest'),
      path.join(xdgConfig, 'Readest'),
      path.join(home, 'Readest')
    );
  }

  return candidates;
}

export interface ReadestPathInfo {
  isValid: boolean;
  basePath: string;
  booksPath: string;
  libraryJsonPath: string;
  bookCount?: number;
}

export function checkReadestPath(targetPath: string): ReadestPathInfo {
  const result: ReadestPathInfo = {
    isValid: false,
    basePath: targetPath,
    booksPath: '',
    libraryJsonPath: '',
    bookCount: 0,
  };

  if (!isNodeAvailable() || !targetPath || targetPath.trim() === '') {
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path');

  const normalized = path.normalize(targetPath.trim());
  if (!fs.existsSync(normalized)) {
    return result;
  }

  // Case 1: normalized contains Books/library.json directly
  const directBooksLib = path.join(normalized, 'Books', 'library.json');
  const directLib = path.join(normalized, 'library.json');

  if (fs.existsSync(directBooksLib)) {
    result.isValid = true;
    result.basePath = normalized;
    result.booksPath = path.join(normalized, 'Books');
    result.libraryJsonPath = directBooksLib;
  } else if (fs.existsSync(directLib)) {
    result.isValid = true;
    result.basePath = path.dirname(normalized);
    result.booksPath = normalized;
    result.libraryJsonPath = directLib;
  } else {
    // Check if parent has Books/library.json
    const parentLib = path.join(normalized, '..', 'Books', 'library.json');
    if (fs.existsSync(parentLib)) {
      result.isValid = true;
      result.basePath = path.join(normalized, '..');
      result.booksPath = path.join(normalized, '..', 'Books');
      result.libraryJsonPath = parentLib;
    }
  }

  if (result.isValid && result.libraryJsonPath) {
    try {
      const content = fs.readFileSync(result.libraryJsonPath, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        result.bookCount = parsed.length;
      }
    } catch {
      // Ignored
    }
  }

  return result;
}

export function autoDetectReadestPath(): ReadestPathInfo | null {
  const candidates = getCandidateReadestPaths();
  for (const candidate of candidates) {
    const info = checkReadestPath(candidate);
    if (info.isValid) {
      return info;
    }
  }
  return null;
}
