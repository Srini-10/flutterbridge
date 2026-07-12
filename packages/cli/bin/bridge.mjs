#!/usr/bin/env node
// The `bridge` entry point. Nothing lives here: it hands argv to main() and returns its exit code.
import { main } from '../dist/index.js';

process.exitCode = await main(process.argv.slice(2));
