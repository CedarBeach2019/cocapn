const vscode = require("vscode");
const path = require("path");
const { spawn } = require("child_process");
const { CocapnTreeProvider } = require("./tree-provider");
const { ChatPanel } = require("./webview/chat-panel");

let cocapnProcess = null;
let chatPanel = new ChatPanel();

function activate(context) {
  const treeProvider = new CocapnTreeProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("cocapn.tree", treeProvider)
  );

  // Start
  context.subscriptions.push(
    vscode.commands.registerCommand("cocapn.start", () => {
      if (cocapnProcess) {
        vscode.window.showInformationMessage("Cocapn is already running");
        return;
      }
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage("Open a workspace folder first");
        return;
      }
      const cwd = workspaceFolders[0].uri.fsPath;
      cocapnProcess = spawn("npx", ["cocapn", "start"], { cwd, stdio: "pipe", shell: true });
      cocapnProcess.on("error", (err) => {
        vscode.window.showErrorMessage(`Failed to start cocapn: ${err.message}`);
        cocapnProcess = null;
      });
      cocapnProcess.on("exit", () => {
        cocapnProcess = null;
        vscode.window.showInformationMessage("Cocapn stopped");
        treeProvider.refresh();
      });
      vscode.window.showInformationMessage("Cocapn starting...");
      treeProvider.refresh();
    })
  );

  // Stop
  context.subscriptions.push(
    vscode.commands.registerCommand("cocapn.stop", () => {
      if (!cocapnProcess) {
        vscode.window.showInformationMessage("Cocapn is not running");
        return;
      }
      cocapnProcess.kill();
      cocapnProcess = null;
      vscode.window.showInformationMessage("Cocapn stopped");
      treeProvider.refresh();
    })
  );

  // Status
  context.subscriptions.push(
    vscode.commands.registerCommand("cocapn.status", async () => {
      try {
        const resp = await fetch("http://localhost:3100/api/status");
        if (!resp.ok) throw new Error("not running");
        const data = await resp.json();
        const channel = vscode.window.createOutputChannel("Cocapn Status");
        channel.clear();
        channel.appendLine(JSON.stringify(data, null, 2));
        channel.show();
      } catch {
        vscode.window.showInformationMessage("Cocapn bridge is not running. Use 'Cocapn: Start' first.");
      }
    })
  );

  // Chat
  context.subscriptions.push(
    vscode.commands.registerCommand("cocapn.chat", () => {
      chatPanel.show(context.extensionUri);
    })
  );

  // Setup
  context.subscriptions.push(
    vscode.commands.registerCommand("cocapn.setup", async () => {
      const options = ["Run cocapn init", "Open documentation"];
      const pick = await vscode.window.showQuickPick(options, { placeHolder: "What would you like to do?" });
      if (pick === "Run cocapn init") {
        const terminal = vscode.window.createTerminal("cocapn setup");
        terminal.sendText("npx cocapn init");
        terminal.show();
      } else if (pick === "Open documentation") {
        vscode.env.openExternal(vscode.Uri.parse("https://cocapn.com/docs"));
      }
    })
  );

  // Refresh tree
  context.subscriptions.push(
    vscode.commands.registerCommand("cocapn.refreshTree", () => {
      treeProvider.refresh();
    })
  );

  // Open file from tree
  context.subscriptions.push(
    vscode.commands.registerCommand("cocapn.openFile", (relativePath) => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) return;
      const fullPath = path.join(workspaceFolders[0].uri.fsPath, relativePath);
      vscode.workspace.openTextDocument(fullPath).then(
        (doc) => vscode.window.showTextDocument(doc),
        () => vscode.window.showErrorMessage(`Cannot open ${relativePath}`)
      );
    })
  );
}

function deactivate() {
  if (cocapnProcess) {
    cocapnProcess.kill();
    cocapnProcess = null;
  }
}

module.exports = { activate, deactivate };
