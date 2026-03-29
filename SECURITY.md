# Security Policy

## Reporting Security Vulnerabilities

We take security seriously. If you discover a vulnerability in cocapn, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

1. **Preferred**: Email security@superinstance.com with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fix

2. **Alternative**: Send a direct message via [our Discord](https://discord.com/invite/clawd) to any maintainer

### What to Expect

- We will acknowledge your report within 48 hours
- We will provide an initial assessment within 5 business days
- We will keep you informed of our progress
- We will credit you in the security fix (unless you prefer anonymity)
- We will request a 90-day disclosure deadline

### Scope

Security issues we care about:
- Remote code execution
- Authentication bypass
- Data leakage (user data, API keys, memory contents)
- Privilege escalation
- Denial of service

### Out of Scope

- Theoretical concerns without proof of concept
- Issues in third-party dependencies (report to them directly)
- Social engineering vectors
- Physical access attacks

## Security Model

### Data Flow
```
User Input → Bridge (local) → PII Filter → LLM API → Response → Brain (local) → User
```

### What Goes Where
| Data | Stored Locally | Sent Externally |
|------|---------------|-----------------|
| Chat messages | Yes (Brain) | Yes (to LLM, PII-filtered) |
| Memory facts | Yes (Brain/wiki) | No |
| API keys | Yes (settings.json) | No (used as auth headers) |
| Plugin code | Yes (plugins dir) | No |
| Telemetry | No (opt-in, anonymous) | Yes (if enabled) |

### Local-Only Mode
Cocapn can run with **zero external network calls**:
- Set `COCAPN_OFFLINE=true` in environment
- All LLM calls will fail gracefully
- Memory, skills, and plugins still work
- Webhook receiver disabled

### Encryption
- API keys stored in plaintext in `~/.cocapn/settings.json` (your local filesystem)
- No encryption at rest for memory data (lives in your Git repo)
- All external communication over HTTPS
- Fleet JWT signed with HMAC-SHA256

### Plugin Security
- ⚠️ **Cold plugins** run in child processes with timeout and memory limits
- ⚠️ **Hot plugins** run in the bridge process with full access
- Permission system exists but is **advisory** (enforcement in progress)
- Only install plugins from trusted sources
- Review plugin code before installing

### Known Limitations
- Plugin sandbox permissions are not yet enforced in the execution path
- No encryption at rest for memory data
- Webhook receiver requires manual authentication setup
- No SSO/SAML support

## Past Security Audits

### 2026-03-29 — Internal Audit
- **Auditor**: Simulated security researcher (GLM-5.1)
- **Findings**: 4 Critical, 5 High, 4 Medium, 3 Info
- **Status**: All Critical and High fixed. Medium tracked.
- **Report**: `docs/security-audit-cycle2.md`

---

Maintained by [Superinstance](https://github.com/superinstance).
