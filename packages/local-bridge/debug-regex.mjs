import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "src/brain/conversation-memory.ts"), "utf8");
const lines = src.split("\n");

// Check for non-ASCII in pattern lines
for (let i = 42; i < 148; i++) {
  const line = lines[i];
  if (line.includes("pattern:")) {
    for (let j = 0; j < line.length; j++) {
      const c = line.charCodeAt(j);
      if (c > 127) {
        console.log(`Non-ASCII at line ${i+1} col ${j}: U+${c.toString(16).padStart(4,"0")}`);
      }
    }
  }
}

// Test the patterns directly using what the source has
// Name pattern line 52
const namePattern = /(?:my name is|i'm |call me|i am |i go by )([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i;
console.log("My name is Casey:", JSON.stringify("My name is Casey".match(namePattern)));
console.log("I'm Alice Johnson:", JSON.stringify("I'm Alice Johnson".match(namePattern)));
console.log("Call me Bob please:", JSON.stringify("Call me Bob please".match(namePattern)));

// Project pattern line 78
const projectPattern1 = /(?:my (?:project|app|product|startup) is|i'm (?:building|working on|developing)|i built) (["']?)([\w][\w\s-]{1,50}?)\1/i;
console.log("My project is cocapn:", JSON.stringify("My project is cocapn".match(projectPattern1)));
console.log("I'm building a robot arm:", JSON.stringify("I'm building a robot arm".match(projectPattern1)));

// Organization pattern line 65
const orgPattern = /(?:i work (?:at|for)|i'm (?:at|working at)|my (?:company|org|employer) is) ([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*)/i;
console.log("I work at Superinstance:", JSON.stringify("I work at Superinstance".match(orgPattern)));

// Now test with the actual extracted patterns from the source
// We'll parse the regex literals from the source file
console.log("\n--- Testing actual patterns from source ---");

// Extract and eval each pattern
const patternLines = lines.filter(l => l.includes("pattern: /"));
for (const line of patternLines) {
  const match = line.match(/pattern:\s*(\/[^/]+\/[a-z]*)/);
  if (match) {
    const regexStr = match[1];
    try {
      // Use Function to evaluate the regex (safer than eval in module context)
      const regex = Function(`"use strict"; return ${regexStr};`)();
      console.log(`Pattern: ${regexStr}`);
      console.log(`  Valid regex: ${regex instanceof RegExp}`);
    } catch(e) {
      console.log(`Pattern: ${regexStr}`);
      console.log(`  ERROR: ${e.message}`);
    }
  }
}
