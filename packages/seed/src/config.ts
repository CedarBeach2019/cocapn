/**
 * Config — schema validation for cocapn.json.
 */

export interface LLMConfig {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface Config {
  mode?: string;
  port?: number;
  llm?: LLMConfig;
  // Legacy flat fields (backward compat)
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export function validateConfig(raw: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (raw.mode !== undefined) {
    if (typeof raw.mode !== 'string' || !['private', 'public'].includes(raw.mode)) {
      errors.push('mode must be "private" or "public"');
    }
  }
  if (raw.port !== undefined) {
    if (typeof raw.port !== 'number' || !Number.isInteger(raw.port) || raw.port < 1 || raw.port > 65535) {
      errors.push('port must be a number between 1 and 65535');
    }
  }
  if (raw.llm !== undefined) {
    if (typeof raw.llm !== 'object' || raw.llm === null) {
      errors.push('llm must be an object');
    } else {
      const llm = raw.llm as Record<string, unknown>;
      if (llm.provider !== undefined && typeof llm.provider !== 'string') errors.push('llm.provider must be a string');
      if (llm.model !== undefined && typeof llm.model !== 'string') errors.push('llm.model must be a string');
      if (llm.baseUrl !== undefined && typeof llm.baseUrl !== 'string') errors.push('llm.baseUrl must be a string');
      if (llm.apiKey !== undefined && typeof llm.apiKey !== 'string') errors.push('llm.apiKey must be a string');
      if (llm.temperature !== undefined && (typeof llm.temperature !== 'number' || llm.temperature < 0 || llm.temperature > 2)) {
        errors.push('llm.temperature must be a number between 0 and 2');
      }
      if (llm.maxTokens !== undefined && (typeof llm.maxTokens !== 'number' || llm.maxTokens < 1)) {
        errors.push('llm.maxTokens must be a positive number');
      }
    }
  }
  return errors;
}

/** Apply defaults to a parsed config */
export function applyDefaults(config: Config): Required<Pick<Config, 'mode' | 'port'>> & Config {
  return {
    ...config,
    mode: config.mode ?? 'private',
    port: config.port ?? 3100,
    llm: {
      provider: config.llm?.provider ?? 'deepseek',
      ...config.llm,
    },
  };
}
