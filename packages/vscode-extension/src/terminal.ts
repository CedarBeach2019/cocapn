import * as vscode from 'vscode';

/**
 * Terminal integration — agent suggests commands, user approves.
 */
export class CocapnTerminal {
  private _terminal: vscode.Terminal | undefined;

  public suggestCommand(command: string, description?: string): void {
    const detail = description || command;
    vscode.window.showInformationMessage(
      `Cocapn suggests: ${detail}`,
      'Run in terminal',
      'Copy',
      'Dismiss'
    ).then((choice) => {
      if (choice === 'Run in terminal') {
        this._runInTerminal(command);
      } else if (choice === 'Copy') {
        vscode.env.clipboard.writeText(command);
        vscode.window.showInformationMessage('Command copied to clipboard');
      }
    });
  }

  private _runInTerminal(command: string): void {
    if (!this._terminal || this._terminal.exitStatus !== undefined) {
      this._terminal = vscode.window.createTerminal('Cocapn');
    }
    this._terminal.show();
    this._terminal.sendText(command);
  }

  dispose(): void {
    this._terminal?.dispose();
  }
}
