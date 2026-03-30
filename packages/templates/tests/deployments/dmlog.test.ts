import { describe, it, expect } from 'vitest';
import { dmlogAi } from '../../src/deployments/dmlog-ai.js';
import { getDeployment, listDeployments, createDeployment } from '../../src/deployments/index.js';

describe('dmlogAi deployment template', () => {
  it('has correct name and domain', () => {
    expect(dmlogAi.name).toBe('DMlog.ai');
    expect(dmlogAi.domain).toBe('dmlog.ai');
  });

  it('includes dungeon-master soul content', () => {
    expect(dmlogAi.soul).toContain('DM AI');
    expect(dmlogAi.soul).toContain('AI Dungeon Master');
    expect(dmlogAi.soul).toContain('Dungeons & Dragons 5e');
  });

  it('has correct config overrides', () => {
    expect(dmlogAi.config.llm.provider).toBe('deepseek');
    expect(dmlogAi.config.llm.model).toBe('deepseek-chat');
    expect(dmlogAi.config.llm.maxTokens).toBe(4096);
    expect(dmlogAi.config.mode.default).toBe('public');
    expect(dmlogAi.config.brain.autoSync).toBe(true);
  });

  it('has required modules enabled', () => {
    expect(dmlogAi.modules).toContain('personality');
    expect(dmlogAi.modules).toContain('knowledge');
    expect(dmlogAi.modules).toContain('templates');
    expect(dmlogAi.modules).toContain('fleet');
    expect(dmlogAi.modules).toHaveLength(4);
  });

  it('has required plugins enabled', () => {
    expect(dmlogAi.plugins).toContain('dice-roller');
    expect(dmlogAi.plugins).toContain('character-stats');
    expect(dmlogAi.plugins).toContain('npc-panel');
    expect(dmlogAi.plugins).toHaveLength(3);
  });

  it('has correct web title and favicon', () => {
    expect(dmlogAi.web.title).toBe('DMlog.ai \u2014 Your AI Dungeon Master');
    expect(dmlogAi.web.favicon).toBe('/favicon-dmlog.svg');
  });

  it('has dark theme with gold accent', () => {
    expect(dmlogAi.web.theme.darkMode).toBe(true);
    expect(dmlogAi.web.theme.colors.primary).toBe('#c9a23c');
    expect(dmlogAi.web.theme.colors.background).toBe('#1a1a2e');
  });

  it('has deployment env vars', () => {
    expect(dmlogAi.env.DEPLOYMENT_VERTICAL).toBe('dmlog');
    expect(dmlogAi.env.DEPLOYMENT_DOMAIN).toBe('dmlog.ai');
  });
});

describe('deployment registry', () => {
  it('lists deployments', () => {
    const deployments = listDeployments();
    expect(deployments).toContain('dmlogAi');
  });

  it('gets deployment by camelCase name', () => {
    const deployment = getDeployment('dmlogAi');
    expect(deployment).toBeDefined();
    expect(deployment!.name).toBe('DMlog.ai');
  });

  it('gets deployment by kebab-case name', () => {
    const deployment = getDeployment('dmlog-ai');
    expect(deployment).toBeDefined();
    expect(deployment!.domain).toBe('dmlog.ai');
  });

  it('returns undefined for unknown deployment', () => {
    expect(getDeployment('nonexistent')).toBeUndefined();
  });
});

describe('createDeployment', () => {
  it('returns the provided template', () => {
    const custom = createDeployment({
      ...dmlogAi,
      name: 'Custom DM',
      domain: 'custom.example.com',
      soul: dmlogAi.soul,
      config: dmlogAi.config,
      modules: dmlogAi.modules,
      plugins: dmlogAi.plugins,
      env: dmlogAi.env,
      web: dmlogAi.web,
    });

    expect(custom.name).toBe('Custom DM');
    expect(custom.domain).toBe('custom.example.com');
  });
});
