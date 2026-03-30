/**
 * Mock development server for E2E tests
 *
 * Provides a minimal UI that simulates the Cocapn bridge interface
 * without requiring the full Node.js bridge to run.
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const PORT = 5173;

// Store messages for verification
const mockMessages = [];
const mockUpdates = [];
let mockStreak = 5;

// HTTP server for UI
const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Serve test pages
  if (url.pathname === '/' || url.pathname === '/chat') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getChatHTML());
  } else if (url.pathname === '/magazine') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getMagazineHTML());
  } else if (url.pathname === '/api/messages') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mockMessages));
  } else if (url.pathname === '/api/updates') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mockUpdates));
  } else if (url.pathname === '/api/streak') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ streak: mockStreak }));
  } else if (url.pathname === '/api/publish' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body);
      mockUpdates.push({
        id: String(mockUpdates.length + 1),
        content: data.content,
        timestamp: new Date().toISOString(),
        streak: mockStreak++
      });
      res.writeHead(201);
      res.end(JSON.stringify({ success: true }));
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// WebSocket server for bridge communication
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    bridgeId: 'test-bridge-123',
    timestamp: new Date().toISOString()
  }));

  // Handle messages from client
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      mockMessages.push(msg);

      // Echo response for chat messages
      if (msg.type === 'chat') {
        ws.send(JSON.stringify({
          type: 'chat-response',
          content: `Echo: ${msg.content}`,
          agentId: msg.agentId,
          timestamp: new Date().toISOString()
        }));
      }

      // Acknowledge other messages
      ws.send(JSON.stringify({
        type: 'ack',
        id: msg.id,
        timestamp: new Date().toISOString()
      }));
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'error',
        message: err.message
      }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`Mock E2E server running on http://localhost:${PORT}`);
  console.log('WebSocket endpoint: ws://localhost:' + PORT + '/ws');
});

function getChatHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cocapn Chat - E2E Test</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .container { max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
    .status { width: 12px; height: 12px; border-radius: 50%; background: #ccc; }
    .status.connected { background: #22c55e; }
    .messages { border: 1px solid #e5e7eb; border-radius: 8px; height: 300px; overflow-y: auto; padding: 10px; margin-bottom: 10px; }
    .message { margin-bottom: 10px; padding: 8px 12px; border-radius: 6px; }
    .message.user { background: #f3f4f6; }
    .message.agent { background: #dbeafe; }
    .input-area { display: flex; gap: 10px; }
    #messageInput { flex: 1; padding: 10px; border: 1px solid #e5e7eb; border-radius: 6px; }
    button { padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; }
    button:hover { background: #2563eb; }
    button:disabled { background: #9ca3af; cursor: not-allowed; }
    .streak-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: #fef3c7; border-radius: 20px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="status" id="status"></div>
      <h1>Cocapn Chat</h1>
      <div class="streak-badge">🔥 <span id="streakCount">5</span> day streak</div>
    </div>
    <div class="messages" id="messages"></div>
    <div class="input-area">
      <input type="text" id="messageInput" placeholder="Type a message..." />
      <button id="sendBtn">Send</button>
      <button id="publishBtn">Publish Update</button>
    </div>
  </div>

  <script>
    let ws = null;
    const messages = [];
    const statusEl = document.getElementById('status');
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const publishBtn = document.getElementById('publishBtn');
    const streakCount = document.getElementById('streakCount');

    function connect() {
      ws = new WebSocket('ws://localhost:5173/ws');

      ws.onopen = () => {
        statusEl.classList.add('connected');
        sendBtn.disabled = false;
        addMessage('system', 'Connected to bridge');
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'chat-response') {
          addMessage('agent', data.content);
        } else if (data.type === 'connected') {
          console.log('Bridge connected:', data.bridgeId);
        }
      };

      ws.onclose = () => {
        statusEl.classList.remove('connected');
        addMessage('system', 'Disconnected from bridge');
      };
    }

    function addMessage(type, content) {
      messages.push({ type, content, time: new Date() });
      messagesEl.innerHTML = messages.map(m =>
        '<div class="message ' + m.type + '">' + m.content + '</div>'
      ).join('');
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    sendBtn.addEventListener('click', () => {
      const content = inputEl.value.trim();
      if (!content || !ws) return;

      ws.send(JSON.stringify({ type: 'chat', content, agentId: 'default' }));
      addMessage('user', content);
      inputEl.value = '';
    });

    publishBtn.addEventListener('click', async () => {
      const response = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: inputEl.value.trim() })
      });
      if (response.ok) {
        streakCount.textContent = parseInt(streakCount.textContent) + 1;
        addMessage('system', 'Update published!');
      }
    });

    inputEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendBtn.click();
    });

    connect();
  </script>
</body>
</html>`;
}

function getMagazineHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cocapn Magazine - E2E Test</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; }
    .container { max-width: 900px; margin: 0 auto; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
    .streak-banner { background: linear-gradient(135deg, #fbbf24, #f59e0b); color: white; padding: 15px 20px; border-radius: 12px; text-align: center; margin-bottom: 20px; }
    .streak-number { font-size: 36px; font-weight: bold; }
    .updates { display: grid; gap: 20px; }
    .update { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .update-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .update-streak { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: #fef3c7; border-radius: 20px; font-size: 14px; }
    .update-time { color: #6b7280; font-size: 14px; }
    .update-content { line-height: 1.6; }
    .empty-state { text-align: center; padding: 40px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Cocapn Magazine</h1>
      <div class="update-streak">🔥 <span id="headerStreak">5</span> day streak</div>
    </div>

    <div class="streak-banner">
      <div class="streak-number">🔥 <span id="bannerStreak">5</span></div>
      <div>days in a row!</div>
    </div>

    <div class="updates" id="updates">
      <div class="empty-state">No updates yet. Start chatting to build your streak!</div>
    </div>
  </div>

  <script>
    async function loadUpdates() {
      const response = await fetch('/api/updates');
      const updates = await response.json();
      const updatesEl = document.getElementById('updates');

      if (updates.length === 0) {
        updatesEl.innerHTML = '<div class="empty-state">No updates yet. Start chatting to build your streak!</div>';
        return;
      }

      updatesEl.innerHTML = updates.map(u =>
        '<div class="update">' +
          '<div class="update-header">' +
            '<span class="update-streak">🔥 Day ' + u.streak + '</span>' +
            '<span class="update-time">' + new Date(u.timestamp).toLocaleDateString() + '</span>' +
          '</div>' +
          '<div class="update-content">' + u.content + '</div>' +
        '</div>'
      ).join('');

      if (updates.length > 0) {
        document.getElementById('headerStreak').textContent = updates[updates.length - 1].streak;
        document.getElementById('bannerStreak').textContent = updates[updates.length - 1].streak;
      }
    }

    loadUpdates();
  </script>
</body>
</html>`;
}
