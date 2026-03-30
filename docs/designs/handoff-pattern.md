# Module Handoff Pattern Design

## Concept
Modules can delegate tasks to other modules mid-conversation. This enables multi-step workflows without the user needing to explicitly switch contexts.

## Pattern
```
User → Chat Module → detects scheduling request
                    → returns { handoff: { module: 'schedule', context: 'remind me tomorrow at 3pm to review PR' } }
       Router processes handoff → sends to Schedule Module
       Schedule Module → creates reminder
                        → returns { handoff: { module: 'chat', context: 'reminder created for tomorrow 3pm' } }
       Router processes handoff → sends to Chat Module
       Chat Module → responds to user: "I've set a reminder for tomorrow at 3pm to review the PR."
```

## Implementation

### Handoff Response Type
```typescript
interface HandoffResponse {
  module: string;           // target module name
  context: string;          // what to tell the target module
  urgency?: 'low' | 'normal' | 'high';  // default: normal
  returnTo?: string;        // module to return to after completion (default: sender)
}

// Module handler returns this instead of a regular response:
type ModuleResult = 
  | { type: 'response'; content: string }
  | { type: 'handoff'; handoff: HandoffResponse }
  | { type: 'multi'; responses: string[]; handoffs: HandoffResponse[] };
```

### Handoff depth limit
- Max handoff depth: 5 (prevents infinite loops)
- If depth exceeded: force response with error message
- Track depth in ConversationState

### Router Changes
```typescript
async handleMessage(sessionId: string, message: string): Promise<string> {
  const state = conversationTracker.getState(sessionId);
  let depth = 0;
  const MAX_DEPTH = 5;
  
  // Initial classification
  let result = await routeToModule(message, state);
  
  // Process handoffs
  while (result.type === 'handoff' && depth < MAX_DEPTH) {
    depth++;
    const handoff = result.handoff;
    
    // Update conversation state
    conversationTracker.update(sessionId, { activeModule: handoff.module });
    
    // Route to target module with handoff context
    result = await routeToModule(handoff.context, state, handoff.module);
    
    // If target requests return, handle it
    if (result.type === 'handoff' && result.handoff.module === state.previousModule) {
      depth = MAX_DEPTH; // Force exit after return
    }
  }
  
  if (depth >= MAX_DEPTH && result.type === 'handoff') {
    return 'I got stuck trying to complete your request. Let me try a different approach.';
  }
  
  return result.content;
}
```

### Handoff-Eligible Modules
Not all modules should hand off. Declare eligibility in module manifest:
```json
{
  "name": "chat",
  "canHandoffTo": ["schedule", "publish", "git"],
  "canReceiveHandoff": true,
  "handoffExamples": [
    { trigger: "remind me", target: "schedule" },
    { trigger: "publish this", target: "publish" },
    { trigger: "commit these changes", target: "git" }
  ]
}
```

### Examples

**Scheduling handoff:**
- User: "remind me to review the auth PR tomorrow"
- Chat detects "remind" → handoff to Schedule
- Schedule creates reminder → handoff back to Chat
- Chat responds: "Done! I'll remind you tomorrow to review the auth PR."

**Code + Publish handoff:**
- User: "write a blog post about the new auth system and publish it"
- Chat writes the post → handoff to Publish
- Publish formats + publishes → handoff back to Chat
- Chat responds: "Published! Here's the link: ..."

**Git + Chat handoff:**
- User: "commit and push these changes, then tell Casey it's ready"
- Chat detects "commit and push" → handoff to Git
- Git commits + pushes → handoff back to Chat
- Chat responds to user: "Pushed! Want me to message Casey?"

### Token Impact
- Each handoff: ~200 tokens overhead (context transfer)
- But saves: full re-classification + re-context-assembly (~500 tokens)
- Net: saves ~300 tokens per multi-step task

---

*Design doc — 2026-03-29*
