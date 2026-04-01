import * as vscode from 'vscode';

export class FileWatcher extends vscode.Disposable {
  private _serverUrl: string;
  private _watcher: vscode.FileSystemWatcher;
  private _debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(serverUrl: string) {
    super(() => this.dispose());
    this._serverUrl = serverUrl;

    this._watcher = vscode.workspace.createFileSystemWatcher(
      '**/*',
      false, // create
      false, // change
      false  // delete
    );

    this._watcher.onDidCreate((uri) => this._notify('create', uri));
    this._watcher.onDidChange((uri) => this._debounce('change', uri));
    this._watcher.onDidDelete((uri) => this._notify('delete', uri));
  }

  private _debounce(event: string, uri: vscode.Uri): void {
    const key = uri.fsPath;
    const existing = this._debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    this._debounceTimers.set(
      key,
      setTimeout(() => {
        this._debounceTimers.delete(key);
        this._notify(event, uri);
      }, 2000)
    );
  }

  private async _notify(event: string, uri: vscode.Uri): Promise<void> {
    const relPath = vscode.workspace.asRelativePath(uri);

    // Skip internal paths
    if (relPath.startsWith('node_modules/') || relPath.startsWith('.git/')) {
      return;
    }

    try {
      await fetch(`${this._serverUrl}/api/file-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, path: relPath }),
      });
    } catch {
      // Silently ignore — agent might not be running
    }
  }

  override dispose(): void {
    this._watcher.dispose();
    for (const timer of this._debounceTimers.values()) {
      clearTimeout(timer);
    }
    this._debounceTimers.clear();
  }
}
