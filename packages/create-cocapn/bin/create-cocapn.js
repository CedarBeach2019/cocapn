#!/usr/bin/env node
import { createCocapn } from '../src/index.js';
createCocapn(process.argv[2], {
  template: process.argv.includes('--template') ? process.argv[process.argv.indexOf('--template') + 1] : undefined,
  domain: process.argv.includes('--domain') ? process.argv[process.argv.indexOf('--domain') + 1] : undefined,
  username: process.argv.includes('--username') ? process.argv[process.argv.indexOf('--username') + 1] : undefined,
  skipSecrets: process.argv.includes('--skip-secrets'),
  skipLLMTest: process.argv.includes('--skip-llm-test'),
});
