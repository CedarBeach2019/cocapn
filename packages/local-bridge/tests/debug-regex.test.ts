import { describe, it, expect } from "vitest";
import { ConversationMemory } from "../src/brain/conversation-memory.js";

describe("DEBUG regex", () => {
  it("debug patterns", () => {
    const m = new ConversationMemory({} as any);
    const r1 = m.extractFactsHeuristic("My name is Casey");
    console.log("My name is Casey:", JSON.stringify(r1));
    const r2 = m.extractFactsHeuristic("I'm Alice Johnson");
    console.log("I'm Alice Johnson:", JSON.stringify(r2));
    const r3 = m.extractFactsHeuristic("Call me Bob please");
    console.log("Call me Bob please:", JSON.stringify(r3));
    const r4 = m.extractFactsHeuristic("My project is cocapn");
    console.log("My project is cocapn:", JSON.stringify(r4));

    // Direct regex
    const nameRe = /(?:my name is|i'm |call me|i am |i go by )([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i;
    console.log("direct My name is Casey:", JSON.stringify("My name is Casey".match(nameRe)));
    console.log("direct I'm Alice Johnson:", JSON.stringify("I'm Alice Johnson".match(nameRe)));
    console.log("direct Call me Bob please:", JSON.stringify("Call me Bob please".match(nameRe)));

    expect(true).toBe(true);
  });
});
