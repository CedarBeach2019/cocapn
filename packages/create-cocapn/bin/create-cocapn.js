#!/usr/bin/env node
import { createCocapn } from '../src/index.js';
createCocapn(process.argv[2] || '.');
