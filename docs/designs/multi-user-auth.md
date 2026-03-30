# Multi-User Authentication — Design Document

> **Status:** DRAFT
> **Author:** Superinstance
> **Last Updated:** 2026-03-29
> **Target:** Cloudflare Workers with AdmiralDO backend

---

## 1. Overview

Cocapn Cloudflare Workers currently operate in guest mode with no persistent user authentication. This design introduces a comprehensive multi-user authentication system that enables:

- **User accounts** with email/password authentication
- **JWT-based session management** with refresh tokens
- **User-specific Worker instances** (e.g., `username.cocapn.ai` or custom domains)
- **Rate limiting** per user and per plan tier
- **API key management** for programmatic access
- **Admin panel** for user management
- **Backward compatibility** with existing guest mode

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Browser/UI    │────▶│  Cloudflare     │────▶│    AdmiralDO    │
│                 │     │  Workers        │     │  (SQLite)       │
└─────────────────┘     │  - Auth layer   │     └─────────────────┘
                        │  - Rate limiting│     ┌─────────────────┐
                        └─────────────────┘────▶│   Cloudflare KV │
                                                 │  - Sessions     │
                                                 │  - Rate limits  │
                                                 └─────────────────┘
```

### Key Design Principles

1. **JWT-based stateless auth** — Workers validate tokens locally, no database hit per request
2. **Refresh token rotation** — Short-lived access tokens (15 min), long-lived refresh tokens (30 days)
3. **PBKDF2 password hashing** — Web Crypto API, 100,000 iterations, SHA-256
4. **Per-user isolation** — Each user gets their own Worker instance/namespace
5. **Graceful guest fallback** — Existing guest mode (5 free requests) retained for discovery

---

## 2. Authentication Flow

### 2.1 Sign Up

**Endpoint:** `POST /api/auth/signup`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "Jane Developer",
  "instance": "janedev",  // Optional: subdomain for username.cocapn.ai
  "plan": "free"
}
```

**Flow:**

1. **Validate input**
   - Email format & uniqueness (case-insensitive)
   - Password requirements (8+ chars, mixed case, number)
   - Instance name format (alphanumeric, 3-20 chars)

2. **Hash password**
   ```typescript
   const encoder = new TextEncoder();
   const keyMaterial = await crypto.subtle.importKey(
     "raw",
     encoder.encode(password),
     "PBKDF2",
     false,
     ["deriveBits"]
   );

   const salt = crypto.getRandomValues(new Uint8Array(16));
   const hash = await crypto.subtle.deriveBits(
     {
       name: "PBKDF2",
       salt,
       iterations: 100000,
       hash: "SHA-256"
     },
     keyMaterial,
     256
   );
   ```

3. **Store user in AdmiralDO**
   ```sql
   INSERT INTO users (
     id, email, passwordHash, passwordSalt,
     name, instance, plan, createdAt
   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
   ```

4. **Generate JWT pair**
   - Access token (15 min): signed with `USER_JWT_SECRET`
   - Refresh token (30 days): random UUID, stored in KV

5. **Return response**
   ```json
   {
     "user": {
       "id": "uuid-here",
       "email": "user@example.com",
       "name": "Jane Developer",
       "instance": "janedev",
       "plan": "free",
       "createdAt": "2026-03-29T12:00:00Z"
     },
     "tokens": {
       "accessToken": "eyJhbGci...",
       "refreshToken": "uuid-v4",
       "expiresIn": 900
     }
   }
   ```

### 2.2 Sign In

**Endpoint:** `POST /api/auth/signin`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Flow:**

1. **Fetch user by email** (case-insensitive)
2. **Verify password** — Re-derive PBKDF2 hash and compare
3. **Check account status** — Not suspended/banned
4. **Generate new JWT pair** — Rotate refresh token
5. **Update last login** — `UPDATE users SET lastLogin = ?`
6. **Return response** (same as signup)

### 2.3 Token Refresh

**Endpoint:** `POST /api/auth/refresh`

**Request:**
```json
{
  "refreshToken": "uuid-v4"
}
```

**Flow:**

1. **Lookup refresh token in KV**
   ```
   GET KV:refresh-token:{uuid}
   ```
   Returns: `{"userId": "uuid", "createdAt": "..."}`

2. **Validate** — Not expired (>30 days), not revoked

3. **Generate new access token** — Keep same refresh token (or rotate)

4. **Return response**
   ```json
   {
     "accessToken": "eyJhbGci...",
     "expiresIn": 900
   }
   ```

### 2.4 Sign Out

**Endpoint:** `POST /api/auth/signout`

**Request:**
```json
{
  "refreshToken": "uuid-v4"
}
```

**Flow:**

1. **Delete refresh token from KV**
2. **Add token to blocklist** (optional, for immediate access token revocation)
3. **Return success**

---

## 3. User Model

### 3.1 Database Schema

**Table: `users`** (in AdmiralDO SQLite)

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,              -- UUID v4
  email TEXT UNIQUE NOT NULL,       -- Lowercase
  passwordHash TEXT NOT NULL,       -- PBKDF2-SHA256 (32 bytes)
  passwordSalt TEXT NOT NULL,       -- 16 bytes, base64
  name TEXT NOT NULL,               -- Display name
  instance TEXT UNIQUE,             -- Subdomain (optional)
  plan TEXT DEFAULT 'free',         -- 'free' | 'pro'
  createdAt TEXT NOT NULL,          -- ISO timestamp
  lastLogin TEXT,                   -- ISO timestamp
  lastLoginIp TEXT,                 -- For security monitoring
  settings TEXT,                    -- JSON blob
  status TEXT DEFAULT 'active',     -- 'active' | 'suspended' | 'banned'
  metadata TEXT                     -- JSON blob (analytics, etc.)
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_instance ON users(instance);
CREATE INDEX idx_users_plan ON users(plan);
CREATE INDEX idx_users_status ON users(status);
```

**Table: `refresh_tokens`** (in Cloudflare KV)

```
Key: refresh-token:{uuid}
Value: {
  "userId": "user-uuid",
  "createdAt": "2026-03-29T12:00:00Z",
  "userAgent": "Mozilla/5.0...",
  "ip": "192.168.1.1"
}
TTL: 30 days
```

### 3.2 TypeScript Interface

```typescript
interface User {
  id: string;              // UUID v4
  email: string;           // lowercase, unique
  passwordHash: string;    // PBKDF2-SHA256, base64
  passwordSalt: string;    // 16 bytes, base64
  name: string;            // Display name
  instance?: string;       // Custom subdomain (optional)
  plan: 'free' | 'pro';
  createdAt: string;       // ISO timestamp
  lastLogin?: string;      // ISO timestamp
  lastLoginIp?: string;    // For security monitoring
  settings?: Record<string, any>;
  status: 'active' | 'suspended' | 'banned';
  metadata?: Record<string, any>;
}

interface AuthTokens {
  accessToken: string;     // JWT, 15 min
  refreshToken: string;    // UUID v4, 30 days
  expiresIn: number;       // Seconds
}

interface AuthResponse {
  user: Omit<User, 'passwordHash' | 'passwordSalt'>;
  tokens: AuthTokens;
}
```

---

## 4. JWT Token Structure

### 4.1 Access Token

**Header:**
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**Payload:**
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "name": "Jane Developer",
  "instance": "janedev",
  "plan": "free",
  "iat": 1700000000,
  "exp": 1700000900,
  "iss": "cocapn.ai",
  "aud": "cocapn-workers"
}
```

**Signed with:** `USER_JWT_SECRET` (Cloudflare secret)

**Expiration:** 15 minutes (900 seconds)

### 4.2 Refresh Token

Refresh tokens are **NOT JWTs** — they are random UUIDs stored in KV. This allows:

- Immediate revocation by deletion
- Rate limiting per refresh token
- Device tracking (user agent, IP)

**Format:** UUID v4
**Storage:** Cloudflare KV with 30-day TTL
**Rate limit:** 100 refresh requests per hour per token

---

## 5. Rate Limiting

### 5.1 Per-Plan Limits

| Plan | Requests/Minute | Tokens/Day | Concurrent Agents | Storage |
|------|-----------------|------------|-------------------|---------|
| Free | 60              | 100K       | 1                 | 100 MB  |
| Pro  | 300             | 1M         | 5                 | 1 GB    |

### 5.2 Implementation

**Two-tier rate limiting:**

1. **Per-user limits** — Counted in KV, reset every minute/day
   ```
   Key: ratelimit:user:{userId}:minute
   Value: request count
   TTL: 60 seconds

   Key: ratelimit:user:{userId}:day
   Value: token count
   TTL: 24 hours
   ```

2. **Per-IP limits** — Prevent abuse from single IP
   ```
   Key: ratelimit:ip:{clientIp}:hour
   Value: request count
   TTL: 3600 seconds
   ```

### 5.3 Rate Limit Response

**Headers:**
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1700000100
```

**Error (429):**
```json
{
  "error": "rate_limit_exceeded",
  "message": "Rate limit exceeded. Try again in 18 seconds.",
  "retryAfter": 18
}
```

---

## 6. API Key Management

### 6.1 API Keys

Users can generate API keys for programmatic access (CLI, scripts, integrations).

**Endpoint:** `POST /api/keys`

**Request:**
```json
{
  "name": "CLI on MacBook",
  "scopes": ["read", "write"]
}
```

**Response:**
```json
{
  "id": "key-uuid",
  "name": "CLI on MacBook",
  "key": "cocapn_sk_abc123...",  // Show only on creation
  "scopes": ["read", "write"],
  "createdAt": "2026-03-29T12:00:00Z",
  "lastUsed": null
}
```

### 6.2 Storage

**Table: `api_keys`** (in AdmiralDO)

```sql
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  keyHash TEXT NOT NULL,        -- SHA-256 of prefix + secret
  keyPrefix TEXT NOT NULL,      -- First 8 chars for identification
  name TEXT NOT NULL,
  scopes TEXT NOT NULL,         -- JSON array
  createdAt TEXT NOT NULL,
  lastUsed TEXT,
  expiresAt TEXT,               -- Optional expiration
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE INDEX idx_api_keys_user ON api_keys(userId);
CREATE INDEX idx_api_keys_prefix ON api_keys(keyPrefix);
```

### 6.3 Key Format

**Format:** `cocapn_sk_{random}`

- **Prefix:** `cocapn_sk_` (identifiable)
- **Secret:** 32 bytes random, base64-encoded
- **Total length:** ~50 characters

**Usage:**

```
Authorization: Bearer cocapn_sk_abc123...
```

### 6.4 Key Rotation

Users can:

- Revoke individual keys
- Set expiration dates
- Rotate all keys (emergency)

---

## 7. Security Measures

### 7.1 Password Requirements

- **Minimum length:** 8 characters
- **Complexity:** Uppercase + lowercase + number
- **Common password check:** Reject top 10,000 common passwords
- **Hashing:** PBKDF2-SHA256, 100,000 iterations, 16-byte salt

### 7.2 Brute Force Protection

**Per-IP lockout:**
- 5 failed attempts → 15-minute lockout
- Counter stored in KV, 15-minute TTL

**Per-email lockout:**
- 10 failed attempts → 1-hour lockout
- Stored in AdmiralDO, cleared on successful login

### 7.3 Session Security

**Refresh token rotation:**
- New refresh token issued on each refresh
- Old token invalidated (short grace period for concurrent requests)

**Access token expiration:**
- Short-lived (15 minutes)
- No mechanism to revoke (use refresh token blocklist for emergencies)

### 7.4 CORS & Headers

**Strict CORS:**
```
Access-Control-Allow-Origin: https://{user-instance}.cocapn.ai
Access-Control-Allow-Methods: GET, POST, PUT, DELETE
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
```

**Security headers:**
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

### 7.5 Input Validation

All inputs validated with JSON schemas (from `schemas/`):

```typescript
const signupSchema = {
  type: "object",
  required: ["email", "password", "name"],
  properties: {
    email: { type: "string", format: "email" },
    password: { type: "string", minLength: 8, pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])" },
    name: { type: "string", minLength: 1, maxLength: 100 },
    instance: { type: "string", pattern: "^[a-z0-9]{3,20}$" }
  }
};
```

---

## 8. Guest Mode (Backward Compatibility)

### 8.1 Existing Behavior

Current Worker allows anonymous access with:
- 5 free requests per IP (stored in KV)
- No persistent data
- No customization

### 8.2 Upsell Flow

After 5 guest requests, return:

```json
{
  "error": "guest_limit_exceeded",
  "message": "You've reached the guest limit. Sign up for free to continue.",
  "signupUrl": "https://cocapn.ai/signup?ref=guest"
}
```

### 8.3 Guest → Paid Migration

When guest signs up:
- Pre-fill email if provided during guest session
- Offer guest instance data export (if any)
- Discount code: `GUESTUP` → 1 month free Pro

---

## 9. Admin Panel

### 9.1 Admin Endpoints

**Authentication:** Requires `ADMIN_JWT_SECRET` + superadmin email

**Endpoints:**

- `GET /admin/users` — List all users (paginated)
- `GET /admin/users/:id` — Get user details
- `PUT /admin/users/:id` — Update user (plan, status)
- `DELETE /admin/users/:id` — Delete user (cascade delete)
- `GET /admin/stats` — Usage statistics
- `POST /admin/users/:id/suspend` — Suspend user
- `POST /admin/users/:id/ban` — Ban user (permanent)

### 9.2 Admin UI

Single-page app at `/admin` with:

- User table (search, filter, sort)
- Per-user usage charts (tokens, requests)
- Plan management (upgrade/downgrade)
- Account actions (suspend, ban, delete)
- System stats (total users, active today, Pro conversion)

### 9.3 Audit Log

**Table: `audit_log`** (in AdmiralDO)

```sql
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  adminId TEXT NOT NULL,
  userId TEXT NOT NULL,
  action TEXT NOT NULL,        -- 'suspend', 'ban', 'delete', 'plan_change'
  details TEXT,                -- JSON blob
  createdAt TEXT NOT NULL,
  FOREIGN KEY (adminId) REFERENCES users(id),
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

---

## 10. Migration Strategy

### 10.1 Phase 1: Backend (Week 1)

- Implement auth endpoints in Workers
- Create users table in AdmiralDO
- Add KV storage for refresh tokens
- Write integration tests

### 10.2 Phase 2: Frontend (Week 2)

- Build signup/signin forms
- Implement JWT storage (localStorage + cookie)
- Add auth context to React app
- Build user dashboard

### 10.3 Phase 3: Rate Limiting (Week 3)

- Implement per-user rate limiting
- Add rate limit headers to all responses
- Build admin panel
- Migrate guest limits to new system

### 10.4 Phase 4: Launch (Week 4)

- Feature flag: `AUTH_ENABLED`
- Gradual rollout (10% → 50% → 100%)
- Monitor metrics (signup rate, conversion)
- Disable guest mode after 30 days

---

## 11. Error Handling

### 11.1 Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `invalid_credentials` | 401 | Wrong email or password |
| `user_exists` | 409 | Email already registered |
| `user_not_found` | 404 | User doesn't exist |
| `token_expired` | 401 | Refresh token expired |
| `token_revoked` | 401 | Refresh token revoked |
| `rate_limit_exceeded` | 429 | Too many requests |
| `account_suspended` | 403 | Account suspended |
| `account_banned` | 403 | Account permanently banned |
| `invalid_token` | 401 | Invalid access token |
| `missing_token` | 401 | No authorization header |

### 11.2 Error Response Format

```json
{
  "error": "invalid_credentials",
  "message": "Invalid email or password",
  "code": "AUTH_001",
  "timestamp": "2026-03-29T12:00:00Z"
}
```

---

## 12. Testing Strategy

### 12.1 Unit Tests

- Password hashing/verification
- JWT generation/validation
- Input validation schemas
- Rate limit counter logic

### 12.2 Integration Tests

- Signup → signin → refresh flow
- Rate limit enforcement
- API key CRUD
- Admin actions (suspend, ban)

### 12.3 E2E Tests

- Full signup flow with email verification
- Signin with wrong password
- Token refresh after expiration
- Admin panel user management

---

## 13. Monitoring & Analytics

### 13.1 Metrics to Track

- **Auth metrics**
  - Signup rate (per day)
  - Signin success rate
  - Failed login attempts (per IP, per user)
  - Token refresh rate

- **Usage metrics**
  - Requests per user (per day)
  - Tokens consumed (per day)
  - API keys created/revoked
  - Guest → paid conversion rate

### 13.2 Alerting

- Alert on: >100 failed logins from single IP in 1 hour
- Alert on: >50 signup attempts from single IP in 1 hour
- Alert on: Error rate >5% on auth endpoints

---

## 14. Future Enhancements

### 14.1 Social Auth

Add OAuth providers:
- GitHub
- Google
- Email magic links

### 14.2 Multi-Factor Authentication

- TOTP (Time-based One-Time Password)
- SMS backup codes
- WebAuthn (hardware keys)

### 14.3 Organization Accounts

- Teams with shared billing
- Role-based access control (owner, admin, member)
- Per-team rate limits

### 14.4 SSO Integration

- SAML 2.0 for enterprise
- LDAP integration
- Custom OIDC providers

---

## 15. Open Questions

1. **Email verification** — Require email verification before account activation?
   - **Recommendation:** Yes, but allow 24-hour grace period

2. **Password reset** — Implement password reset flow?
   - **Recommendation:** Yes, use time-limited reset tokens (1 hour)

3. **Session concurrency** — Limit simultaneous sessions per user?
   - **Recommendation:** No, but track active devices in UI

4. **Data export** — Provide GDPR data export?
   - **Recommendation:** Yes, export as JSON with all user data

5. **Account deletion** — Hard delete or anonymize?
   - **Recommendation:** Anonymize (keep email for uniqueness, erase PII)

---

## 16. References

- [Cloudflare Workers: Authentication Best Practices](https://developers.cloudflare.com/workers/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [RFC 6749: OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749)
- [RFC 7519: JSON Web Token (JWT)](https://datatracker.ietf.org/doc/html/rfc7519)
- [NIST SP 800-63B: Digital Identity Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)

---

**Document Version:** 1.0
**Last Modified:** 2026-03-29
**Next Review:** 2026-04-05
