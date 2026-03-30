const fs = require("fs");
const html = fs.readFileSync("packages/ui-minimal/index.html", "utf8");
const escaped = html
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");
const output = `/**
 * Embedded chat UI HTML — served at / and /chat from the cloud worker.
 *
 * This is the same as packages/ui-minimal/index.html but with the WebSocket
 * URL derived dynamically from window.location so it works on any domain
 * without rebuild.
 *
 * v2: soul.md-driven personality, mode switcher, responsive design
 */

export const CHAT_HTML = \`${escaped}\`;
`;
fs.writeFileSync("packages/cloud-agents/src/chat-html.ts", output);
console.log("Written:", output.length, "bytes");
