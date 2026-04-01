import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import 'dotenv/config';
const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', '..', 'migrations');

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id        SERIAL PRIMARY KEY,
        filename  TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const appliedResult = await client.query<{ filename: string }>(
      'SELECT filename FROM _migrations ORDER BY filename ASC'
    );
    const applied = new Set(appliedResult.rows.map((r) => r.filename));

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  ✓ ${file} (already applied)`);
        continue;
      }

      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`  ✓ ${file} (applied)`);
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ ${file} FAILED:`, err);
        throw err;
      }
    }

    if (count === 0) {
      console.log('  ✓ All migrations already applied. Schema is up to date.');
    } else {
      console.log(`\n  Applied ${count} migration(s) successfully.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

console.log('\n=== Rayyan Pro — Running Migrations ===\n');
migrate()
  .then(() => {
    console.log('\n=== Migrations Complete ===\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n=== Migration Failed ===\n', err);
    process.exit(1);
  });
