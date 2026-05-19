/* Node.js ESM loader — intercepts https:// CDN imports (firebase etc.)
   ที่ browser app ใช้ CDN แต่ Node.js test runner รันไม่ได้
   Usage: node --import ./tests/loader.mjs tests/run.mjs */

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./tests/loader-hooks.mjs', pathToFileURL('./'));
