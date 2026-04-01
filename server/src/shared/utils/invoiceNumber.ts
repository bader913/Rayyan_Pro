import type pg from 'pg';

export const generateInvoiceNumber = async (
  client: pg.PoolClient,
  prefix: string
): Promise<string> => {
  await client.query(
    `INSERT INTO invoice_sequences (prefix, last_number)
     VALUES ($1, 0)
     ON CONFLICT (prefix) DO NOTHING`,
    [prefix]
  );

  const result = await client.query<{ last_number: number }>(
    `UPDATE invoice_sequences
     SET last_number = last_number + 1
     WHERE prefix = $1
     RETURNING last_number`,
    [prefix]
  );

  const num = result.rows[0].last_number;
  const year = new Date().getFullYear();
  const padded = String(num).padStart(3, '0');

  return `${prefix}-${year}-${padded}`;
};
