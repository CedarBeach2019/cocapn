/**
 * Tests for AdmiralDO SQLite-backed storage.
 *
 * Tests the new SQLite storage with KV fallback:
 *   - SQLite schema creation
 *   - Register + search + profile lookup via SQL
 *   - Task scheduling + execution via SQL
 *   - KV fallback when SQL unavailable
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  AdmiralDO,
  type RegistryProfile,
  type ScheduledTaskConfig,
} from "../src/admiral.js";

// ─── Mock SQL-enabled DurableObjectState ─────────────────────────────────────────────

interface SqlRow {
  [key: string]: string | number | null;
}

class SqlResult implements ResultSet {
  constructor(private rows: SqlRow[]) {}

  get columns(): string[] {
    return this.rows.length > 0 ? Object.keys(this.rows[0]!) : [];
  }

  *[Symbol.iterator](): Iterator<SqlRow> {
    for (const row of this.rows) {
      yield row;
    }
  }

  // Read-only array methods
  get length(): number {
    return this.rows.length;
  }

  at(index: number): SqlRow | undefined {
    return this.rows.at(index);
  }

  forEach(callback: (row: SqlRow, index: number) => void): void {
    this.rows.forEach(callback);
  }

  map<T>(callback: (row: SqlRow, index: number) => T): T[] {
    return this.rows.map(callback);
  }

  filter(callback: (row: SqlRow, index: number) => boolean): SqlRow[] {
    return this.rows.filter(callback);
  }

  flatMap<T>(callback: (row: SqlRow, index: number) => T[]): T[] {
    return this.rows.flatMap(callback);
  }

  slice(start?: number, end?: number): SqlRow[] {
    return this.rows.slice(start, end);
  }

  reduce<T>(callback: (acc: T, row: SqlRow, index: number) => T, initial: T): T {
    return this.rows.reduce(callback, initial);
  }

  get [Symbol.toStringTag](): string {
    return "SqlResult";
  }

  toArray(): SqlRow[] {
    return [...this.rows];
  }

  toJSON(): SqlRow[] {
    return this.rows;
  }

  get [0](): SqlRow | undefined {
    return this.rows[0];
  }

  get [1](): SqlRow | undefined {
    return this.rows[1];
  }
}

class MockSqlStorage {
  private store = new Map<string, unknown>();
  private tables = new Map<string, Array<SqlRow>>();
  private alarms = new Map<string, Date>();
  private sqlEnabled = true;

  constructor(sqlEnabled = true) {
    this.sqlEnabled = sqlEnabled;
  }

  setSqlEnabled(enabled: boolean): void {
    this.sqlEnabled = enabled;
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async setAlarm(time: Date, id: string): Promise<void> {
    this.alarms.set(id, time);
  }

  // SQL mock implementation
  async sql<T extends ResultSet>(
    strings: TemplateStringsArray,
    ...values: Array<string | number | boolean | null>
  ): Promise<T> {
    if (!this.sqlEnabled) {
      throw new Error("SQL not available");
    }

    // Parse the SQL query
    let query = strings[0] ?? "";
    for (let i = 0; i < values.length; i++) {
      query += String(values[i]!);
      query += strings[i + 1] ?? "";
    }

    const trimmedQuery = query.trim().toLowerCase();

    // CREATE TABLE
    if (trimmedQuery.startsWith("create table")) {
      const match = trimmedQuery.match(/create table if not exists (\w+)/);
      if (match) {
        const tableName = match[1];
        if (!this.tables.has(tableName)) {
          this.tables.set(tableName, []);
        }
      }
      return new SqlResult([]) as T;
    }

    // CREATE INDEX
    if (trimmedQuery.startsWith("create index")) {
      return new SqlResult([]) as T;
    }

    // INSERT
    if (trimmedQuery.startsWith("insert into")) {
      const insertMatch = trimmedQuery.match(/insert into (\w+) \((.+)\) values \((.+)\)/);
      if (insertMatch) {
        const [, tableName, columns, vals] = insertMatch;
        const colNames = columns.split(", ").map((c) => c.trim());
        const valueList = vals.split(", ").map((v) => {
          const trimmed = v.trim();
          if (trimmed === "null") return null;
          if (trimmed.startsWith("'") || trimmed.startsWith('"')) return trimmed.slice(1, -1);
          return trimmed;
        });

        const row: SqlRow = {};
        colNames.forEach((col, i) => {
          row[col] = valueList[i];
        });

        // Handle ON CONFLICT
        if (trimmedQuery.includes("on conflict")) {
          const tableRows = this.tables.get(tableName) ?? [];
          const primaryKey = row["username"] ?? row["taskId"] ?? row["queueId"];
          const existingIdx = tableRows.findIndex((r) => {
            const pk = r["username"] ?? r["taskId"] ?? r["queueId"];
            return pk === primaryKey;
          });

          if (existingIdx >= 0) {
            // Update existing row
            tableRows[existingIdx] = row;
          } else {
            tableRows.push(row);
          }
          this.tables.set(tableName, tableRows);
        } else {
          const tableRows = this.tables.get(tableName) ?? [];
          tableRows.push(row);
          this.tables.set(tableName, tableRows);
        }
      }
      return new SqlResult([]) as T;
    }

    // SELECT
    if (trimmedQuery.startsWith("select")) {
      const selectMatch = trimmedQuery.match(/select (.+) from (\w+)(.*)/);
      if (selectMatch) {
        const [, columns, tableName, rest] = selectMatch;
        let tableRows = this.tables.get(tableName) ?? [];

        // Handle WHERE clause
        const whereMatch = rest.match(/where (.+?)(?: order by| limit| group by|$)/);
        if (whereMatch) {
          const whereClause = whereMatch[1];
          tableRows = tableRows.filter((row) => {
            // Simple WHERE implementation
            if (whereClause.includes(" like ")) {
              const [col, pattern] = whereClause.split(" like ").map((s) => s.trim());
              const rowVal = String(row[col] ?? "").toLowerCase();
              const searchPattern = pattern.replace(/^['"]%|%['"]$/g, "").toLowerCase();
              return rowVal.includes(searchPattern);
            }
            if (whereClause.includes(" = ")) {
              const [col, val] = whereClause.split(" = ").map((s) => s.trim());
              const rowVal = row[col];
              const cmpVal = val.replace(/^['"]|['"]$/g, "");
              return String(rowVal) === cmpVal;
            }
            if (whereClause.includes(" > ")) {
              const [col, val] = whereClause.split(" > ").map((s) => s.trim());
              const rowVal = row[col];
              const cmpVal = val.replace(/^['"]|['"]$/g, "");
              return rowVal !== null && String(rowVal) > cmpVal;
            }
            return true;
          });
        }

        // Handle ORDER BY
        const orderMatch = rest.match(/order by (.+?)(?: limit| group by|$)/);
        if (orderMatch) {
          const orderCol = orderMatch[1].trim();
          tableRows = [...tableRows].sort((a, b) => {
            const aVal = a[orderCol] ?? "";
            const bVal = b[orderCol] ?? "";
            return String(bVal).localeCompare(String(aVal));
          });
        }

        // Handle LIMIT
        const limitMatch = rest.match(/limit (\d+)/);
        if (limitMatch) {
          const limit = parseInt(limitMatch[1], 10);
          tableRows = tableRows.slice(0, limit);
        }

        return new SqlResult(tableRows) as T;
      }
    }

    // UPDATE
    if (trimmedQuery.startsWith("update")) {
      const updateMatch = trimmedQuery.match(/update (\w+) set (.+) where (.+)/);
      if (updateMatch) {
        const [, tableName, setClause, whereClause] = updateMatch;
        const tableRows = this.tables.get(tableName) ?? [];

        // Parse SET clause
        const sets = setClause.split(",").map((s) => {
          const [col, val] = s.split("=").map((v) => v.trim());
          const trimmedVal = val.replace(/^['"]|['"]$/g, "");
          return { col, val: trimmedVal === "null" ? null : trimmedVal };
        });

        tableRows.forEach((row) => {
          // Check WHERE condition
          const whereParts = whereClause.split(" = ").map((s) => s.trim());
          const col = whereParts[0];
          const val = whereParts[1]?.replace(/^['"]|['"]$/g, "");

          if (String(row[col]) === val) {
            sets.forEach(({ col, val }) => {
              row[col] = val;
            });
          }
        });
      }
      return new SqlResult([]) as T;
    }

    // DELETE
    if (trimmedQuery.startsWith("delete from")) {
      const deleteMatch = trimmedQuery.match(/delete from (\w+) where (.+)/);
      if (deleteMatch) {
        const [, tableName, whereClause] = deleteMatch;
        let tableRows = this.tables.get(tableName) ?? [];

        // Simple WHERE implementation
        tableRows = tableRows.filter((row) => {
          if (whereClause.includes("<")) {
            const [col, val] = whereClause.split("<").map((s) => s.trim());
            const rowVal = row[col];
            const cmpVal = val.replace(/^['"]|['"]$/g, "");
            return rowVal === null || String(rowVal) <= cmpVal;
          }
          return true;
        });

        this.tables.set(tableName, tableRows);
      }
      return new SqlResult([]) as T;
    }

    return new SqlResult([]) as T;
  }

  // Helper for tests
  clear(): void {
    this.store.clear();
    this.tables.clear();
    this.alarms.clear();
  }

  size(): number {
    return this.store.size;
  }

  getTableRows(tableName: string): Array<SqlRow> {
    return this.tables.get(tableName) ?? [];
  }

  getAlarmCount(): number {
    return this.alarms.size;
  }
}

class MockDurableObjectState implements DurableObjectState {
  storage: MockSqlStorage;

  constructor(storage: MockSqlStorage) {
    this.storage = storage as unknown as DurableObjectStorage;
  }
}

// ─── Test utilities ─────────────────────────────────────────────────────────────

function createMockRequest(
  method: string,
  pathname: string,
  body?: unknown,
  query = ""
): Request {
  const url = `https://admiral.test/${pathname}${query}`;
  const init: RequestInit = {
    method,
    body: body ? JSON.stringify(body) : undefined,
  };

  if (body && method === "POST") {
    (init.headers as Record<string, string>) = {
      "Content-Type": "application/json",
    };
  }

  return new Request(url, init);
}

function createMockProfile(username: string, overrides?: Partial<RegistryProfile>): RegistryProfile {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  return {
    username,
    displayName: overrides?.displayName ?? `Test ${username}`,
    currentFocus: overrides?.currentFocus ?? "Building cool stuff",
    website: overrides?.website ?? `https://${username}.example.com`,
    bio: overrides?.bio ?? "A developer building amazing things with cocapn.",
    domains: overrides?.domains ?? ["personallog.ai"],
    signature: overrides?.signature ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    registeredAt: now,
    expiresAt,
  };
}

async function jsonResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

// ─── Test suite ────────────────────────────────────────────────────────────────

describe.skip("AdmiralDO SQLite — requires Cloudflare runtime with SQLite support", () => {
  describe("SQL schema creation", () => {
    it("should create profiles, scheduled_tasks, and task_queue tables", async () => {
      const mockStorage = new MockSqlStorage(true);
      const mockState = new MockDurableObjectState(mockStorage) as unknown as DurableObjectState;
      const admiral = new AdmiralDO(mockState);

      // Register a profile to trigger schema creation
      const profile = createMockProfile("alice");
      const request = createMockRequest("POST", "registry/register", { profile });
      await admiral.fetch(request);

      // Check tables were created
      expect(mockStorage.getTableRows("profiles")).toBeDefined();
      expect(mockStorage.getTableRows("scheduled_tasks")).toBeDefined();
      expect(mockStorage.getTableRows("task_queue")).toBeDefined();
    });
  });

  describe("SQL registry operations", () => {
    let mockStorage: MockSqlStorage;
    let mockState: DurableObjectState;
    let admiral: AdmiralDO;

    beforeEach(() => {
      mockStorage = new MockSqlStorage(true);
      mockState = new MockDurableObjectState(mockStorage) as unknown as DurableObjectState;
      admiral = new AdmiralDO(mockState);
    });

    it("should register a profile via SQL INSERT", async () => {
      const profile = createMockProfile("alice");
      const request = createMockRequest("POST", "registry/register", { profile });

      const response = await admiral.fetch(request);

      expect(response.status).toBe(200);
      const result = await jsonResponse<{ ok: boolean; peerCount: number }>(response);
      expect(result.ok).toBe(true);
      expect(result.peerCount).toBe(1);

      // Verify profile was stored in SQL table
      const profiles = mockStorage.getTableRows("profiles");
      expect(profiles).toHaveLength(1);
      expect(profiles[0]?.username).toBe("alice");
    });

    it("should search profiles via SQL SELECT with LIKE", async () => {
      // Register multiple profiles
      await admiral.fetch(createMockRequest("POST", "registry/register", { profile: createMockProfile("alice", { displayName: "Alice Developer", currentFocus: "Building AI agents" }) }));
      await admiral.fetch(createMockRequest("POST", "registry/register", { profile: createMockProfile("bob", { displayName: "Bob Designer", currentFocus: "Creating beautiful UIs" }) }));
      await admiral.fetch(createMockRequest("POST", "registry/register", { profile: createMockProfile("charlie", { displayName: "Charlie Engineer", currentFocus: "Building AI agents" }) }));

      const request = createMockRequest("GET", "registry/discover", undefined, "?q=AI%20agents");
      const response = await admiral.fetch(request);

      expect(response.status).toBe(200);
      const result = await jsonResponse<{ results: RegistryProfile[]; total: number }>(response);
      expect(result.total).toBe(2);
      const usernames = result.results.map((p) => p.username);
      expect(usernames).toContain("alice");
      expect(usernames).toContain("charlie");
    });

    it("should get profile by username via SQL SELECT", async () => {
      const profile = createMockProfile("alice");
      await admiral.fetch(createMockRequest("POST", "registry/register", { profile }));

      const request = createMockRequest("GET", "registry/profile/alice");
      const response = await admiral.fetch(request);

      expect(response.status).toBe(200);
      const result = await jsonResponse<RegistryProfile>(response);
      expect(result.username).toBe("alice");
      expect(result.displayName).toBe("Test alice");
    });

    it("should update existing profile via SQL UPSERT", async () => {
      const profile1 = createMockProfile("alice", { displayName: "Alice Original" });
      await admiral.fetch(createMockRequest("POST", "registry/register", { profile: profile1 }));

      const profile2 = createMockProfile("alice", { displayName: "Alice Updated" });
      const response = await admiral.fetch(createMockRequest("POST", "registry/register", { profile: profile2 }));

      expect(response.status).toBe(200);
      const result = await jsonResponse<{ ok: boolean; peerCount: number }>(response);
      expect(result.peerCount).toBe(1); // Still 1, not 2

      const profiles = mockStorage.getTableRows("profiles");
      expect(profiles).toHaveLength(1);
      expect(profiles[0]?.displayName).toBe("Alice Updated");
    });
  });

  describe("SQL task queue operations", () => {
    let mockStorage: MockSqlStorage;
    let mockState: DurableObjectState;
    let admiral: AdmiralDO;

    beforeEach(() => {
      mockStorage = new MockSqlStorage(true);
      mockState = new MockDurableObjectState(mockStorage) as unknown as DurableObjectState;
      admiral = new AdmiralDO(mockState);
    });

    it("should schedule tasks via SQL INSERT", async () => {
      const request = createMockRequest("POST", "tasks/schedule", {
        tasks: [
          {
            schedule: "0 9 * * *",
            target: "agent:daily-summary",
            payload: { repo: "user/cocapn" },
            enabled: true,
          },
        ],
      });

      const response = await admiral.fetch(request);

      expect(response.status).toBe(200);
      const result = await jsonResponse<{ ok: boolean; scheduled: number; ids: string[] }>(response);
      expect(result.ok).toBe(true);
      expect(result.scheduled).toBe(1);
      expect(result.ids).toHaveLength(1);

      // Verify task was stored in SQL table
      const tasks = mockStorage.getTableRows("scheduled_tasks");
      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.agent).toBe("agent:daily-summary");
    });

    it("should execute task and record result via SQL", async () => {
      // Schedule a task
      const scheduleReq = createMockRequest("POST", "tasks/schedule", {
        tasks: [
          {
            schedule: "0 9 * * *",
            target: "agent:test",
            payload: { test: true },
            enabled: true,
          },
        ],
      });
      await admiral.fetch(scheduleReq);

      // Get task ID
      const tasks = mockStorage.getTableRows("scheduled_tasks");
      const taskId = tasks[0]?.taskId as string;

      // Execute task
      const execReq = createMockRequest("POST", "tasks/execute", { taskId });
      const execResponse = await admiral.fetch(execReq);

      expect(execResponse.status).toBe(200);
      const execResult = await execResponse.json() as { ok: boolean; status: string };
      expect(execResult.ok).toBe(true);
      expect(execResult.status).toBe("completed");

      // Verify queue item was created
      const queue = mockStorage.getTableRows("task_queue");
      expect(queue.length).toBeGreaterThan(0);
      expect(queue[0]?.status).toBe("completed");
    });

    it("should get task status via SQL SELECT", async () => {
      // Schedule and execute a task
      const scheduleReq = createMockRequest("POST", "tasks/schedule", {
        tasks: [
          {
            schedule: "0 9 * * *",
            target: "agent:test",
            payload: { test: true },
            enabled: true,
          },
        ],
      });
      await admiral.fetch(scheduleReq);

      const tasks = mockStorage.getTableRows("scheduled_tasks");
      const taskId = tasks[0]?.taskId as string;

      const execReq = createMockRequest("POST", "tasks/execute", { taskId });
      await admiral.fetch(execReq);

      // Get status
      const statusReq = createMockRequest("GET", `tasks/status/${taskId}`);
      const statusResponse = await admiral.fetch(statusReq);

      expect(statusResponse.status).toBe(200);
      const statusResult = await statusResponse.json() as { taskId: string; status: string };
      expect(statusResult.taskId).toBe(taskId);
      expect(statusResult.status).toBe("completed");
    });
  });

  describe("KV fallback", () => {
    it("should fall back to KV when SQL is unavailable", async () => {
      const mockStorage = new MockSqlStorage(false); // SQL disabled
      const mockState = new MockDurableObjectState(mockStorage) as unknown as DurableObjectState;
      const admiral = new AdmiralDO(mockState);

      const profile = createMockProfile("alice");
      const request = createMockRequest("POST", "registry/register", { profile });

      const response = await admiral.fetch(request);

      expect(response.status).toBe(200);
      const result = await jsonResponse<{ ok: boolean; peerCount: number }>(response);
      expect(result.ok).toBe(true);
      expect(result.peerCount).toBe(1);

      // Verify data was stored in KV (no SQL tables created)
      expect(mockStorage.getTableRows("profiles")).toHaveLength(0);
    });

    it("should handle KV discovery with SQL disabled", async () => {
      const mockStorage = new MockSqlStorage(false);
      const mockState = new MockDurableObjectState(mockStorage) as unknown as DurableObjectState;
      const admiral = new AdmiralDO(mockState);

      // Register profiles
      await admiral.fetch(createMockRequest("POST", "registry/register", { profile: createMockProfile("alice", { displayName: "Alice Developer" }) }));
      await admiral.fetch(createMockRequest("POST", "registry/register", { profile: createMockProfile("bob", { displayName: "Bob Designer" }) }));

      // Search
      const request = createMockRequest("GET", "registry/discover", undefined, "?q=alice");
      const response = await admiral.fetch(request);

      expect(response.status).toBe(200);
      const result = await jsonResponse<{ results: RegistryProfile[]; total: number }>(response);
      expect(result.total).toBe(1);
      expect(result.results[0]?.username).toBe("alice");
    });
  });
});
