import { ConversationMemory } from "../src/brain/conversation-memory.js";

const m = new ConversationMemory({} as any);

const tests = [
  "My name is Casey",
  "I'm Alice Johnson",
  "Call me Bob please",
  "I work at Superinstance",
  "My project is cocapn",
  "I'm building a robot arm",
  "I'm from Google",
  "I live in San Francisco",
];

for (const t of tests) {
  const facts = m.extractFactsHeuristic(t);
  console.log(`"${t}" => ${JSON.stringify(facts)}`);
}

// Direct regex test
const nameRe = /(?:my name is|i'm |call me|i am |i go by )([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i;
console.log("\nDirect regex tests:");
console.log("My name is Casey:", JSON.stringify("My name is Casey".match(nameRe)));
console.log("I'm Alice Johnson:", JSON.stringify("I'm Alice Johnson".match(nameRe)));
console.log("Call me Bob please:", JSON.stringify("Call me Bob please".match(nameRe)));
