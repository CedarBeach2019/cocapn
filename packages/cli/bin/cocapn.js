#!/usr/bin/env node
/**
 * Cocapn CLI binary entry point
 */

import { createCLI } from '../dist/index.js';

const cli = createCLI();
cli.parse();
