const p = /(?:call me )([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i;
const tests = ["Call me Bob please", "Call me Bob."];
tests.forEach(t => { const m = t.match(p); console.log(t, "->", m ? m[1] : "no match"); });

const p2 = /(?:my name is )([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i;
const tests2 = [
  "My name is Casey\nHi Casey!",
  "My name is Casey.\nHi Casey!",
  "My name is Casey and I work at Superinstance",
  "My name is Casey. I work at Superinstance."
];
tests2.forEach(t => { const m = t.match(p2); console.log(t, "->", m ? JSON.stringify(m[1]) : "no match"); });

const p3 = /(?:my (?:project|app|product|startup) is |i'm (?:building|working on|developing) |i built )(["']?)([\w][\w\s-]{1,50}?)\1/i;
const tests3 = ["My project is cocapn", "I'm building a robot arm"];
tests3.forEach(t => { const m = t.match(p3); console.log(t, "->", "g1:", JSON.stringify(m?.[1]), "g2:", JSON.stringify(m?.[2])); });
