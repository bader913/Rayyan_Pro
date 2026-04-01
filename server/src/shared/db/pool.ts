import pg from 'pg';

const { Pool, types } = pg;

// pg returns bigint (OID 20) as string by default — parse to JS number.
// All our IDs are bigint; values stay within JS safe-integer range.
types.setTypeParser(20, (val: string) => parseInt(val, 10));

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

export const dbGet = async <T = Record<string, any>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (pool as any).query(sql, params) as { rows: T[] };
  return result.rows[0] ?? null;
};

export const dbAll = async <T = Record<string, any>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (pool as any).query(sql, params) as { rows: T[] };
  return result.rows;
};

export const dbRun = async (
  sql: string,
  params: unknown[] = []
): Promise<{ rowCount: number; rows: Record<string, unknown>[] }> => {
  const result = await pool.query(sql, params);
  return {
    rowCount: result.rowCount ?? 0,
    rows: result.rows,
  };
};

export type PoolClient = pg.PoolClient;

export const withTransaction = async <T>(
  operation: (client: pg.PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
