const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.resolve(__dirname, '../payroll.db');
const BACKUP_DIR = path.resolve(__dirname, '../backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const getJSTDate = () => {
  // Add JST offset (UTC+9) and use ISO string to avoid locale formatting quirks
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
};

const timestamp = getJSTDate();
const BACKUP_FILE = path.join(BACKUP_DIR, `payroll_backup_${timestamp}.db`);

console.log(`Starting backup of ${DB_PATH} to ${BACKUP_FILE}...`);

try {
  const db = new Database(DB_PATH, { readonly: true });

  // Use better-sqlite3's backup API (synchronous)
  db.backup(BACKUP_FILE)
    .then(() => {
      console.log('Backup successful');
      console.log(BACKUP_FILE); // Output filename for shell script to capture
      db.close();
    })
    .catch((err) => {
      console.error('Backup failed:', err);
      db.close();
      process.exit(1);
    });
} catch (err) {
  console.error('Failed to open database:', err);
  process.exit(1);
}
