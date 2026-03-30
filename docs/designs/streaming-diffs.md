# Streaming Diff Application Design

## Concept
Apply code diffs as they stream in from the LLM, rather than waiting for the complete response. Makes the agent feel faster — code appears line by line.

## Current Flow
```
User message → LLM generates full response → Parse response → Apply all diffs → Send result
Total wait: LLM generation time + parse time + apply time
```

## Streaming Flow
```
User message → LLM starts streaming → Parser watches for diff markers
  → On each diff chunk: apply partial patch → update file
  → When stream ends: verify all patches applied → send result
Perceived wait: ~0 (user sees code appearing as it's generated)
```

## Implementation

### Diff Stream Parser
```typescript
interface DiffChunk {
  type: 'add' | 'remove' | 'context';
  content: string;
  lineNumber?: number;
  isComplete: boolean;
}

class DiffStreamParser {
  private buffer: string;
  private inDiffBlock: boolean;
  private chunks: DiffChunk[];
  
  // Feed a chunk of streamed text
  feed(chunk: string): DiffChunk[];
  // Returns complete diff chunks ready to apply
  
  // Signal end of stream
  flush(): DiffChunk[];
  // Returns any remaining buffered diff
}
```

### Diff Pattern Detection
The parser looks for:
- Standard unified diff: `@@ -old,+new @@`
- Markdown code fences with diff language: ` ```diff `
- Inline diff markers: `+added line`, `-removed line`
- Aider-style SEARCH/REPLACE blocks:
  ```
  <<<< SEARCH
  old code
  >>>> REPLACE
  new code
  ```

### Partial Application
```typescript
class PartialDiffer {
  private pendingEdits: Map<string, string>; // filePath → partial content
  
  // Apply a diff chunk to the working file
  applyChunk(filePath: string, chunk: DiffChunk): void;
  
  // When a diff for a file is complete, finalize it
  finalize(filePath: string): { success: boolean; error?: string };
  
  // Rollback all pending edits if stream fails
  rollback(): void;
}
```

### WebSocket Integration
- Modify the streaming response handler to pipe through DiffStreamParser
- On each parsed diff chunk: apply to working tree + notify client via WebSocket
- Client receives real-time file updates (show progress in UI)

### Safety
- Keep original file contents until stream completes
- If stream fails mid-diff: rollback all pending changes
- Verify file is valid after each chunk (try to parse as the target language)
- Rate limit: max 10 file edits per second (prevent thrashing)

### Token Impact
- Parser overhead: ~0 tokens (operates on response, not input)
- But enables: shorter responses (agent can output diffs directly instead of full files)
- Net: saves ~30% of output tokens per code edit task

---

*Design doc — 2026-03-29*
