import 'dotenv/config';
import { buildApp } from './app.js';
import { pool } from './shared/db/pool.js';

const PORT = Number(process.env.APP_PORT || process.env.PORT || 3200);
const HOST = '0.0.0.0';

async function main() {
  try {
    const db = await pool.connect();
    db.release();
    console.log('✓ PostgreSQL connected');
  } catch (err) {
    console.error('✗ Failed to connect to PostgreSQL:', err);
    process.exit(1);
  }

  const app = await buildApp();

  await app.listen({ port: PORT, host: HOST });
  console.log(`✓ Rayyan Pro server running on http://localhost:${PORT}`);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
