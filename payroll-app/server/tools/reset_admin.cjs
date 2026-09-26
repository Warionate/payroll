const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = path.resolve(__dirname, '../payroll.db');
const db = new Database(dbPath);

const username = process.argv[2] || 'admin';
const password = process.argv[3] || process.env.ADMIN_PASSWORD;

if (!password) {
  console.error('Usage: node reset_admin.cjs [username] <password>');
  console.error('  or set ADMIN_PASSWORD environment variable');
  process.exit(1);
}

try {
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (row) {
    console.log(`User '${username}' exists. Role: ${row.role}`);
  } else {
    console.log(`User '${username}' does not exist.`);
  }

  const hash = bcrypt.hashSync(password, 10);

  const updateResult = db
    .prepare("UPDATE users SET password_hash = ?, role = 'admin' WHERE username = ?")
    .run(hash, username);

  if (updateResult.changes > 0) {
    console.log(
      `Password and role for user '${username}' updated successfully. Changes: ${updateResult.changes}`,
    );
  } else {
    // User might not exist, create it
    const insertResult = db
      .prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')")
      .run(username, hash);
    console.log(`Admin user '${username}' created successfully.`);
  }
} catch (err) {
  console.error('Error:', err.message);
} finally {
  db.close();
}
