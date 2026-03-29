# Cocapn CLI

Unified CLI tool for cocapn agent runtime and fleet protocol.

## Installation

```bash
npm install -g cocapn
```

Or use with npx:

```bash
npx cocapn <command>
```

## Commands

### Core Commands

```bash
cocapn init [dir]           # Initialize cocapn in a repo
cocapn start                # Start the bridge
cocapn status               # Show bridge status
cocapn version              # Show version
```

### Skill Management

```bash
cocapn skill list           # List available skills
cocapn skill load <name>    # Load a skill
cocapn skill unload <name>  # Unload a skill
```

### Template Management

```bash
cocapn template search <q>  # Search template registry
cocapn template install <n> # Install a template
cocapn template publish     # Publish current directory
```

### Analysis & Monitoring

```bash
cocapn tree <task>          # Start tree search for a task
cocapn graph                # Show knowledge graph stats
cocapn tokens               # Show token usage stats
cocapn health               # Health check (local + cloud)
```

## Options

Commands that communicate with the bridge accept these options:

- `-H, --host <host>`: Bridge host (default: localhost)
- `-p, --port <port>`: Bridge port (default: 3100)
- `-t, --token <token>`: Auth token

## Examples

Initialize a new cocapn project:

```bash
cocapn init ./my-cocapn
cd ./my-cocapn
```

Start the bridge:

```bash
cocapn start
```

Check status:

```bash
cocapn status
```

List skills:

```bash
cocapn skill list
```

Start a tree search:

```bash
cocapn tree "Implement user authentication"
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Link for local testing
npm link
cocapn --help
```

## License

MIT
