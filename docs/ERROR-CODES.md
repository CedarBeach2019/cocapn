# Cocapn Error Codes

This document lists all user-facing error codes in Cocapn. When you encounter an error, the code will help identify the issue and next steps.

## Error Code Format

Errors are formatted as: `COCAPN-XXX: Description - Next action`

Example: `COCAPN-001: Agent already running - Stop the agent first with 'cocapn-bridge agent stop <id>'`

---

## Authentication & Security Errors

| Code | Error Message | Next Action |
|------|---------------|-------------|
| COCAPN-001 | Invalid JWT: expected 3 parts | Ensure your fleet JWT is complete and not truncated. Regenerate with: `cocapn-bridge token generate` |
| COCAPN-002 | Invalid JWT: bad signature | Your fleet JWT may be corrupted or the secret changed. Regenerate with: `cocapn-bridge token generate` |
| COCAPN-003 | Invalid JWT: malformed payload | JWT payload is corrupted. Regenerate with: `cocapn-bridge token generate` |
| COCAPN-004 | JWT expired at {timestamp} | Your fleet token has expired. Generate a new one with: `cocapn-bridge token generate` |
| COCAPN-005 | Invalid JWT issuer: {issuer} | JWT must be issued by "cocapn". Regenerate with: `cocapn-bridge token generate` |
| COCAPN-006 | Unauthorized — fleet JWT required | You need a valid fleet JWT to access this endpoint. Get one with: `cocapn-bridge token generate` |

---

## Agent Management Errors

| Code | Error Message | Next Action |
|------|---------------|-------------|
| COCAPN-010 | Agent already running: {id} | Stop the agent first with: `cocapn-bridge agent stop {id}` or check if another process is using it |
| COCAPN-011 | Agent {id}: failed to get stdio pipes | The agent process failed to start. Check the agent command is valid and executable |
| COCAPN-012 | Agent {id}: failed to spawn - {details} | Check the agent command, args, and working directory. Ensure the agent binary exists and is executable |
| COCAPN-013 | Agent not running: {id} | Start the agent first with: `cocapn-bridge agent start {id}` |
| COCAPN-014 | No agent available for this task | Ensure at least one agent is running. Start with: `cocapn-bridge agent start <id>` |

---

## Module System Errors

| Code | Error Message | Next Action |
|------|---------------|-------------|
| COCAPN-020 | Module not found: {name} | Install the module with: `cocapn-bridge module add <git-url>` |
| COCAPN-021 | No module.yml found in modules/{name}/ | The module is missing its manifest. Reinstall the module from a valid source |
| COCAPN-022 | Agent file destination outside sandbox: {path} | The module tried to write outside its allowed directory. Report this to the module author |
| COCAPN-023 | MCP config destination outside sandbox | The module tried to modify MCP config outside its allowed area. Report to the module author |
| COCAPN-024 | Install hook failed | The module installation failed. Check the module's install script and dependencies |
| COCAPN-025 | Update hook failed | The module update failed. Check the module's update script or reinstall with: `cocapn-bridge module remove {name} && cocapn-bridge module add <git-url>` |

---

## Secret Management Errors

| Code | Error Message | Next Action |
|------|---------------|-------------|
| COCAPN-030 | No public key configured | Initialize age encryption with: `cocapn-bridge secret init` |
| COCAPN-031 | Cannot rotate: no current identity loaded | Load your identity first with: `cocapn-bridge secret load` |
| COCAPN-032 | No public key. Run: cocapn-bridge secret init | Initialize age encryption to encrypt secrets for fleet members |
| COCAPN-033 | No identity loaded. Run: loadIdentity() | Load your age identity with: `cocapn-bridge secret load` |
| COCAPN-034 | Age init failed: {details} | Ensure age is installed. Initialize manually with: `cocapn-bridge secret init --repo <private-repo-path>` |

---

## WebSocket & Protocol Errors

| Code | Error Message | Next Action |
|------|---------------|-------------|
| COCAPN-040 | Invalid MCP method path: {method} | MCP methods must be formatted as 'mcp/{agentId}/{method}'. Check the method name |
| COCAPN-041 | Unsupported MCP method: {method} | The agent doesn't support this MCP method. Check the agent's capabilities |
| COCAPN-042 | Parse error | The WebSocket message was not valid JSON-RPC. Check message format |
| COCAPN-043 | Method not found: {method} | The requested method doesn't exist. Check available methods in documentation |
| COCAPN-044 | Missing required parameter: {param} | Provide the required parameter in your request |

---

## File & Command Execution Errors

| Code | Error Message | Next Action |
|------|---------------|-------------|
| COCAPN-050 | Missing command | Provide a command to execute. Example: `{ type: "BASH", command: "ls -la" }` |
| COCAPN-051 | cwd outside repo root | The working directory escapes the repository. Use a path within the repo |
| COCAPN-052 | Missing path or content | Provide both 'path' and 'content' when editing files |
| COCAPN-053 | Invalid path: {details} | The path is invalid or escapes the repo. Use a relative path within the repository |
| COCAPN-054 | Command execution failed: {details} | Check the command is valid and executable. See error details for specifics |

---

## Scheduler Errors

| Code | Error Message | Next Action |
|------|---------------|-------------|
| COCAPN-060 | Invalid cron expression: {cron} | Check the cron expression format. Example: '0 9 * * 1-5' for weekdays at 9am |
| COCAPN-061 | Could not calculate next run time for cron expression: {cron} | The cron expression may be invalid or use unsupported features |
| COCAPN-062 | Missing required field: cron | Provide a cron expression in the scheduled task |
| COCAPN-063 | Missing required field: agent | Provide an agent ID for the scheduled task |
| COCAPN-064 | Invalid scheduled task configuration | Check all required fields are present (cron, agent, prompt) |

---

## Chat & Cloud Errors

| Code | Error Message | Next Action |
|------|---------------|-------------|
| COCAPN-070 | Missing content | Provide a 'content' field with your chat message |
| COCAPN-071 | No agent available for chat | Start a chat-capable agent with: `cocapn-bridge agent start <id>` |
| COCAPN-072 | Cloud adapter not configured | Configure your cloud adapter in cocapn.yml or ensure cloud services are available |
| COCAPN-073 | Agent not running: {id} | Start the agent with: `cocapn-bridge agent start {id}` |

---

## Repository & Git Errors

| Code | Error Message | Next Action |
|------|---------------|-------------|
| COCAPN-080 | Git conflict in {files} | Resolve merge conflicts manually, then commit. Use: `git status` to see conflicted files |
| COCAPN-081 | GitHub API error: {message} | Check your GitHub PAT is valid and has required permissions. Update with: `cocapn-bridge token set <pat>` |
| COCAPN-082 | Missing gitUrl | Provide a git URL for the operation |
| COCAPN-083 | Missing name | Provide a name parameter for the operation |
| COCAPN-084 | Repository not found | Ensure the repository exists and you have access. Check your git remote URL |

---

## Skin & UI Errors

| Code | Error Message | Next Action |
|------|---------------|-------------|
| COCAPN-090 | Missing skin name | Provide a skin name to update |
| COCAPN-091 | Skin update failed: {message} | Check the skin exists and is valid. Available skins are in the 'skins' directory |

---

## Configuration Errors

| Code | Error Message | Next Action |
|------|---------------|-------------|
| COCAPN-100 | Invalid config file | Check cocapn.yml syntax. Use: `cocapn-bridge validate` to check configuration |
| COCAPN-101 | Missing required config: {field} | Add the required field to cocapn.yml |
| COCAPN-102 | Invalid agent definition | Check the agent definition in cocapn.yml has all required fields: id, command, args |

---

## HTTP Server Errors

| Code | Error Message | Next Action |
|------|---------------|-------------|
| COCAPN-110 | Missing key parameter | Provide the 'key' query parameter for this endpoint |
| COCAPN-111 | Not found | The requested resource doesn't exist. Check the URL path |
| COCAPN-112 | Method not allowed | Use the correct HTTP method for this endpoint (GET, POST, etc.) |

---

## Error Response Format

WebSocket errors follow the JSON-RPC 2.0 error format:

```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "error": {
    "code": -32600,
    "message": "COCAPN-050: Missing command - Provide a command to execute. Example: { type: 'BASH', command: 'ls -la' }"
  }
}
```

Typed message errors include an `error` field:

```json
{
  "type": "BASH_OUTPUT",
  "id": "request-id",
  "done": true,
  "error": "COCAPN-051: cwd outside repo root - The working directory escapes the repository. Use a path within the repo"
}
```

---

## Getting Help

If you encounter an error not listed here, or the suggested action doesn't resolve the issue:

1. Check the logs: `cocapn-bridge logs`
2. Run diagnostics: `cocapn-bridge doctor`
3. Report issues: https://github.com/cocapn/cocapn/issues

Include the error code and any relevant logs when reporting.
