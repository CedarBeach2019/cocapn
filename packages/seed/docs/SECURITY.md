# Security Considerations

This document covers the security model of `@cocapn/seed` and recommendations for deployment.

## API Keys

- API keys (LLM provider tokens) are stored in `cocapn.json`, which is **gitignored** by default
- Keys are never committed to version control
- The seed never transmits keys to third parties — they are sent only to the configured LLM provider endpoint
- Use environment variable injection (`DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, etc.) for automated deployments

## No Eval or Dynamic Code Execution

- The seed does **not** use `eval()`, `new Function()`, or `vm.runInContext`
- No dynamic code loading from external sources
- Plugin system (when available) will use a sandboxed execution model

## Input Sanitization

- All user input is treated as plain text before passing to the LLM
- System prompts are constructed from controlled sources (soul.md, config) — never from raw user input
- Web chat input is sanitized before rendering to prevent XSS

## Rate Limiting

For production deployments, implement rate limiting at the reverse proxy level:

```nginx
limit_req_zone $binary_remote_addr zone=chat:10m rate=10r/m;
```

- The seed itself does not impose rate limits — this is the deployer's responsibility
- Consider per-user quotas for public-facing instances

## Privacy Model

- **Private facts** (prefixed with `private.*`) are never exposed in public mode
- The publishing layer strips private keys before any public response
- Git history analysis only reads local repo data — nothing is transmitted
- Memory stores are local files, not remote databases

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it privately via GitHub Security Advisories rather than opening a public issue.
