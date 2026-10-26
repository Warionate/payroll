/**
 * ENCRYPTION_KEY ローテーションスクリプト
 *
 * DB 内の全暗号化カラムを旧キーで復号し、新キー（AES-256-GCM）で再暗号化する。
 * 旧 CBC 形式・平文のレガシーデータも新形式 (GCM) に統一される。
 *
 * 使い方:
 *   OLD_ENCRYPTION_KEY=<旧32バイト> NEW_ENCRYPTION_KEY=<新32バイト> \
 *     node tools/rotate_encryption_key.cjs [--dry-run]
 *
 * 必ずアプリ停止中（pm2 stop payroll-app）かつメンテナンスモード中に実行すること。
 * 実行前に payroll.db のバックアップコピーを自動作成する。
 * 全件を 1 トランザクションで処理するため、途中で失敗しても DB は変更されない。
 */
const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const GCM_IV_LENGTH = 12;
const GCM_IV_HEX_LENGTH = GCM_IV_LENGTH * 2;
const GCM_TAG_HEX_LENGTH = 16 * 2;

// 暗号化カラムの一覧（サービス層で encrypt() を通しているカラム）。
// 新しい暗号化カラムを追加したら、ここにも追加すること。
const ENCRYPTED_COLUMNS = {
  rates: [
    'wage_1_student',
    'wage_2_students',
    'wage_3_students',
    'wage_4_students',
    'hourly_wage',
    'allowance_day',
    'allowance_gap',
  ],
  fixed_shifts: ['student_count'],
  work_logs: ['student_count', 'duration_minutes', 'note', 'calculated_amount'],
  chat_messages: ['message'],
  broadcasts: ['message'],
};

function loadKey(envName) {
  const key = process.env[envName];
  if (!key || Buffer.byteLength(key, 'utf8') !== 32) {
    console.error(`FATAL: ${envName} must be set and be exactly 32 bytes`);
    process.exit(1);
  }
  return Buffer.from(key, 'utf8');
}

/** server/src/utils/crypto.ts の decrypt と同じ判定ロジック（GCM / 旧CBC / 平文） */
function decryptWith(key, text) {
  if (text === null || text === undefined || text === '') return text;
  const parts = text.split(':');

  if (
    parts.length === 3 &&
    parts[0].length === GCM_IV_HEX_LENGTH &&
    parts[1].length === GCM_TAG_HEX_LENGTH
  ) {
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  if (parts.length === 2) {
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  // 暗号化形式でない = レガシー平文
  return text;
}

function encryptWith(key, text) {
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return (
    iv.toString('hex') + ':' + cipher.getAuthTag().toString('hex') + ':' + encrypted.toString('hex')
  );
}

const dryRun = process.argv.includes('--dry-run');
const oldKey = loadKey('OLD_ENCRYPTION_KEY');
const newKey = loadKey('NEW_ENCRYPTION_KEY');

if (oldKey.equals(newKey)) {
  console.error('FATAL: OLD_ENCRYPTION_KEY and NEW_ENCRYPTION_KEY are identical');
  process.exit(1);
}

const dbPath = path.resolve(__dirname, '../payroll.db');
if (!fs.existsSync(dbPath)) {
  console.error(`FATAL: database not found: ${dbPath}`);
  process.exit(1);
}

// 実行前バックアップ
if (!dryRun) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.pre-rotation-${stamp}`;
  fs.copyFileSync(dbPath, backupPath);
  console.log(`Backup created: ${backupPath}`);
}

const db = new Database(dbPath, { readonly: dryRun });

let total = 0;
let failed = 0;

try {
  const rotateAll = db.transaction(() => {
    for (const [table, columns] of Object.entries(ENCRYPTED_COLUMNS)) {
      const rows = db.prepare(`SELECT id, ${columns.join(', ')} FROM ${table}`).all();
      const update = dryRun
        ? null
        : db.prepare(
            `UPDATE ${table} SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
          );

      let tableCount = 0;
      for (const row of rows) {
        const newValues = [];
        let changed = false;
        for (const col of columns) {
          const value = row[col];
          if (value === null || value === undefined || value === '') {
            newValues.push(value);
            continue;
          }
          let plain;
          try {
            plain = decryptWith(oldKey, value);
          } catch (err) {
            console.error(`  DECRYPT FAILED: ${table}.${col} id=${row.id}: ${err.message}`);
            failed++;
            throw new Error('Aborting rotation — fix the data above or verify OLD_ENCRYPTION_KEY');
          }
          newValues.push(encryptWith(newKey, plain));
          changed = true;
        }
        if (changed) {
          if (!dryRun) update.run(...newValues, row.id);
          tableCount++;
        }
      }
      console.log(`${table}: ${tableCount} rows ${dryRun ? 'verified' : 're-encrypted'}`);
      total += tableCount;
    }
  });

  rotateAll();
  console.log(
    dryRun
      ? `\nDry run OK — ${total} rows decrypt cleanly with OLD_ENCRYPTION_KEY.`
      : `\nDone — ${total} rows re-encrypted with the new key.`,
  );
  if (!dryRun) {
    console.log('Next steps:');
    console.log('  1. .env の ENCRYPTION_KEY を新キーに更新');
    console.log('  2. pm2 start payroll-app で再起動し、給与額が正しく表示されることを確認');
    console.log('  3. 確認が済んだら payroll.db.pre-rotation-* バックアップを安全に処分');
  }
} catch (err) {
  console.error(`\nFAILED: ${err.message}`);
  console.error('No changes were committed (single transaction).');
  process.exitCode = 1;
} finally {
  db.close();
}
