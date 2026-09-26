/**
 * Environment configuration — must be imported first in any entry point.
 * ESM modules evaluate imports before top-level code, so this module
 * ensures dotenv is configured before any other module reads process.env.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
