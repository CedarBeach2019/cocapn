# Cocapn Demo — 60 Seconds

> A step-by-step demo script showcasing cocapn's persistent memory.

## Setup (prerecorded or asciinema)

```
$ npx create-cocapn my-agent
$ cd my-agent
$ cocapn start
# Browser opens to localhost:3000
```

## The Wow Moment

```
You: "My name is Casey and I work at Superinstance"
Agent: "Nice to meet you, Casey! I've saved that."
```

Stop the bridge:

```
$ Ctrl+C
```

Restart:

```
$ cocapn start
```

```
You: "What's my name?"
Agent: "Your name is Casey. You work at Superinstance."
```

The agent remembered. That's the demo.

## Features Shown

| Feature | Why It Matters |
|---------|---------------|
| 60-second install | Zero friction to start |
| WebSocket chat | Real-time conversation |
| Persistent memory (Brain) | Remembers across sessions |
| Self-assembly | Configures itself on first run |

## Recording Tips

- Use [asciinema](https://asciinema.org/) for terminal recordings
- Speed up `npx create-cocapn` install with pre-cached packages
- Pause after "What's my name?" response to let the moment land
- Target total length: 60 seconds
- Export as GIF with `asciinema gif` or `agg`
