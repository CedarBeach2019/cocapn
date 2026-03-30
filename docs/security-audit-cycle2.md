# Security Audit — Priya (Security Researcher)
## 16 Findings: 4 Critical, 5 High, 4 Medium, 3 Info

### Critical (must fix before beta):
- C-01: GitHub PAT in git remote URL (plaintext in .git/config)
- C-02: Hardcoded default JWT secret ("default-secret")
- C-03: Unauthenticated webhook trigger on 0.0.0.0
- C-04: Plugin sandbox does not enforce permissions (decorative only)

### High (fix before handling sensitive data):
- H-01: Secrets passed as plaintext env vars to child processes
- H-02: LLM API keys stored in plaintext config
- H-03: Cloud chat endpoint unauthenticated
- H-04: AdmiralDO registry/task endpoints unauthenticated

### Medium:
- M-01: No encryption at rest for user memory
- M-02: PII sent to LLMs without filtering (direct call path)
- M-03: No user visibility into LLM request content
- M-04: Facts stored without user confirmation

### Info:
- L-01: Audit log no integrity protection
- L-02: Telemetry session ID persists across restarts
- L-03: Token prefix logged in CLI
