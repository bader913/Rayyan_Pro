import pg from 'pg';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existing = await client.query(
      "SELECT COUNT(*) as count FROM users WHERE username = 'admin'"
    );

    if (Number(existing.rows[0]?.count) > 0) {
      console.log('  ✓ Seed data already exists. Skipping.');
      await client.query('ROLLBACK');
      return;
    }

    const adminHash = await bcrypt.hash('admin123', 10);
    const cashierHash = await bcrypt.hash('cashier123', 10);
    const warehouseHash = await bcrypt.hash('warehouse123', 10);

    await client.query(`
      INSERT INTO users (username, password_hash, full_name, role, is_protected)
      VALUES
        ('admin',     $1, 'المدير العام',   'admin',     TRUE),
        ('cashier1',  $2, 'موظف كاشير 1',  'cashier',   FALSE),
        ('warehouse1',$3, 'موظف مخزن',     'warehouse', FALSE)
    `, [adminHash, cashierHash, warehouseHash]);

    await client.query(`
      INSERT INTO categories (name) VALUES
        ('مواد غذائية'),
        ('مشروبات'),
        ('منظفات'),
        ('ألبان وأجبان'),
        ('خضروات وفواكه'),
        ('دخان')
    `);

    await client.query(`
      INSERT INTO pos_terminals (code, name, location) VALUES
        ('POS-01', 'كاشير رئيسي', 'المدخل الرئيسي'),
        ('POS-02', 'كاشير احتياطي', 'المدخل الجانبي')
    `);

    await client.query(`
      INSERT INTO settings (key, value) VALUES
        ('shop_name',         'المتجر الريان'),
        ('shop_phone',        '096xxxxxxx'),
        ('shop_address',      ''),
        ('currency',          'USD'),
        ('usd_to_syp',        '11000'),
        ('usd_to_try',        '44'),
        ('usd_to_sar',        '3.75'),
        ('usd_to_aed',        '3.67'),
        ('receipt_footer',    'شكراً لزيارتكم!'),
        ('low_stock_threshold','10'),
        ('theme_color',       '#059669'),
        ('theme_mode',        'light'),
        ('show_usd',          'true'),
        ('enable_shifts',     'false')
    `);

    await client.query(`
      INSERT INTO invoice_sequences (prefix, last_number) VALUES
        ('INV', 0),
        ('RET', 0),
        ('PUR', 0)
    `);

    await client.query('COMMIT');
    console.log('  ✓ Seed data inserted successfully.');
    console.log('');
    console.log('  Default credentials:');
    console.log('    admin / admin123');
    console.log('    cashier1 / cashier123');
    console.log('    warehouse1 / warehouse123');

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

console.log('\n=== Rayyan Pro — Running Seed ===\n');
seed()
  .then(() => {
    console.log('\n=== Seed Complete ===\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n=== Seed Failed ===\n', err);
    process.exit(1);
  });
