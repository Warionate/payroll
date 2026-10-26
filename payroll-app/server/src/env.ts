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

// このプロセスが作るファイル（payroll.db の WAL/SHM・バックアップ・アップロード）を本人だけが読めるようにする。
// 同じサーバーの別ユーザー（クラウドの既定ユーザー等）から DB を読まれないため
process.umask(0o077);
