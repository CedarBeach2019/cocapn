const vscode = require("vscode");

const CHAT_HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); display: flex; flex-direction: column; height: 100vh; }
    #messages { flex: 1; overflow-y: auto; padding: 12px; }
    .msg { margin-bottom: 12px; max-width: 80%; padding: 8px 12px; border-radius: 8px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
    .msg.user { background: var(--vscode-input-background); margin-left: auto; border: 1px solid var(--vscode-input-border); }
    .msg.agent { background: var(--vscode-notifications-backgroundIcon); opacity: 0.9; }
    .msg.system { color: var(--vscode-descriptionForeground); font-style: italic; font-size: 0.9em; }
    #input-bar { display: flex; padding: 8px 12px; gap: 8px; border-top: 1px solid var(--vscode-panel-border); }
    #input { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 8px; font-family: inherit; font-size: inherit; resize: none; outline: none; }
    #input:focus { border-color: var(--vscode-focusBorder); }
    #send { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; padding: 8px 16px; cursor: pointer; font-family: inherit; font-size: inherit; }
    #send:hover { background: var(--vscode-button-hoverBackground); }
    #status { padding: 4px 12px; font-size: 0.85em; color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <div id="status">Connecting to cocapn bridge...</div>
  <div id="messages"></div>
  <div id="input-bar">
    <textarea id="input" rows="1" placeholder="Ask your agent..." autofocus></textarea>
    <button id="send">Send</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('input');
    const sendEl = document.getElementById('send');
    const statusEl = document.getElementById('status');

    function appendMessage(role, text) {
      const div = document.createElement('div');
      div.className = 'msg ' + role;
      div.textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function setStatus(text) {
      statusEl.textContent = text;
    }

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    sendEl.addEventListener('click', send);

    function send() {
      const text = inputEl.value.trim();
      if (!text) return;
      appendMessage('user', text);
      inputEl.value = '';
      vscode.postMessage({ type: 'chat', text });
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'agent-reply') {
        appendMessage('agent', msg.text);
      } else if (msg.type === 'status') {
        setStatus(msg.text);
      } else if (msg.type === 'system') {
        appendMessage('system', msg.text);
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;

class ChatPanel {
  constructor() {
    this.panel = null;
  }

  show(extensionUri) {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "cocapn.chat",
      "Cocapn Chat",
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    this.panel.webview.html = CHAT_HTML;

    this.panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "ready") {
        this.panel.webview.postMessage({ type: "system", text: "Ready. Messages go to localhost:3100" });
        return;
      }

      if (msg.type === "chat") {
        try {
          const resp = await fetch("http://localhost:3100/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: msg.text }),
          });
          if (!resp.ok) {
            this.panel.webview.postMessage({ type: "status", text: "Bridge not running (start with Cocapn: Start)" });
            this.panel.webview.postMessage({ type: "agent-reply", text: "Cannot reach cocapn bridge at localhost:3100. Run 'Cocapn: Start' first." });
            return;
          }
          const data = await resp.json();
          this.panel.webview.postMessage({ type: "agent-reply", text: data.reply || JSON.stringify(data) });
        } catch (err) {
          this.panel.webview.postMessage({ type: "agent-reply", text: "Connection failed — is cocapn running? (Cocapn: Start)" });
        }
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = null;
    });
  }
}

module.exports = { ChatPanel };
