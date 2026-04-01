import { pool, dbGet, withTransaction } from '../../shared/db/pool.js';

export interface ShiftRow {
  id: string;
  user_id: string;
  pos_terminal_id: string | null;
  opening_balance: string;
  opening_note: string | null;
  closing_note: string | null;
  opened_at: string;
  closed_at: string | null;
  status: 'open' | 'closed';
  closing_cash_counted: string;
  expected_cash: string;
  difference: string;
  cashier_name?: string;
  terminal_name?: string;
  terminal_code?: string;
}

export interface ShiftSummary extends ShiftRow {
  sales_count: number;
  sales_total: string;
  cash_total: string;
  card_total: string;
  credit_total: string;
}

const SHIFT_SELECT = `
  SELECT s.*,
    u.full_name AS cashier_name,
    t.name AS terminal_name,
    t.code AS terminal_code
  FROM shifts s
  JOIN users u ON u.id = s.user_id
  LEFT JOIN pos_terminals t ON t.id = s.pos_terminal_id
`;

export class ShiftsService {
  // ─── Current open shift for this user/terminal ────────────────────────────
  async getCurrentShift(userId: number, terminalId?: number): Promise<ShiftRow | null> {
    const conditions = [`s.user_id = $1`, `s.status = 'open'`];
    const values: unknown[] = [userId];

    if (terminalId) {
      conditions.push(`s.pos_terminal_id = $${values.length + 1}`);
      values.push(terminalId);
    }

    const result = await pool.query<ShiftRow>(
      `${SHIFT_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY s.opened_at DESC LIMIT 1`,
      values
    );

    return result.rows[0] ?? null;
  }

  // ─── Open a new shift ─────────────────────────────────────────────────────
  async openShift(data: {
    userId: number;
    terminalId: number | null;
    openingBalance: number;
    openingNote?: string;
  }): Promise<ShiftRow> {
    // Prevent double-open on same terminal
    if (data.terminalId) {
      const existing = await dbGet(
        `SELECT id FROM shifts WHERE pos_terminal_id = $1 AND status = 'open'`,
        [data.terminalId]
      );
      if (existing) {
        throw Object.assign(
          new Error('يوجد وردية مفتوحة بالفعل على هذا الجهاز'),
          { statusCode: 409 }
        );
      }
    }

    // Prevent same user opening 2 shifts
    const existingUser = await dbGet(
      `SELECT id FROM shifts WHERE user_id = $1 AND status = 'open'`,
      [data.userId]
    );
    if (existingUser) {
      throw Object.assign(
        new Error('يوجد وردية مفتوحة بالفعل لهذا المستخدم'),
        { statusCode: 409 }
      );
    }

    const result = await pool.query<{ id: string }>(
      `INSERT INTO shifts (user_id, pos_terminal_id, opening_balance, opening_note, status)
       VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
      [data.userId, data.terminalId, data.openingBalance, data.openingNote ?? null]
    );

    const shiftId = result.rows[0].id;
    const shift = await pool.query<ShiftRow>(
      `${SHIFT_SELECT} WHERE s.id = $1`,
      [shiftId]
    );

    return shift.rows[0];
  }

  // ─── Close shift ──────────────────────────────────────────────────────────
  async closeShift(
    id: number,
    data: { closingCashCounted: number; closingNote?: string; userId: number }
  ): Promise<ShiftSummary> {
    const shift = await dbGet<{ status: string; user_id: string }>(
      'SELECT status, user_id FROM shifts WHERE id = $1',
      [id]
    );

    if (!shift) {
      throw Object.assign(new Error('الوردية غير موجودة'), { statusCode: 404 });
    }
    if (shift.status === 'closed') {
      throw Object.assign(new Error('الوردية مغلقة بالفعل'), { statusCode: 409 });
    }
    // Only the shift owner can close (check by string to avoid type mismatch on BIGINT)
    if (String(shift.user_id) !== String(data.userId)) {
      throw Object.assign(new Error('لا يمكنك إغلاق وردية شخص آخر'), { statusCode: 403 });
    }

    // Calculate expected cash
    const totalsResult = await pool.query<{
      cash_total: string;
      opening_balance: string;
    }>(
      `SELECT
         (SELECT opening_balance FROM shifts WHERE id = $1) AS opening_balance,
         COALESCE(SUM(CASE WHEN payment_method IN ('cash','mixed') THEN paid_amount ELSE 0 END), 0) AS cash_total
       FROM sales WHERE shift_id = $1`,
      [id]
    );

    const openingBalance  = parseFloat(totalsResult.rows[0].opening_balance);
    const cashSales       = parseFloat(totalsResult.rows[0].cash_total);
    const expectedCash    = openingBalance + cashSales;
    const difference      = data.closingCashCounted - expectedCash;

    await pool.query(
      `UPDATE shifts SET
         status = 'closed',
         closed_at = NOW(),
         closing_cash_counted = $1,
         closing_note = $2,
         expected_cash = $3,
         difference = $4,
         updated_at = NOW()
       WHERE id = $5`,
      [data.closingCashCounted, data.closingNote ?? null, expectedCash, difference, id]
    );

    return this.getShiftSummary(id);
  }

  // ─── Shift summary ────────────────────────────────────────────────────────
  async getShiftSummary(id: number): Promise<ShiftSummary> {
    const shiftResult = await pool.query<ShiftRow>(
      `${SHIFT_SELECT} WHERE s.id = $1`,
      [id]
    );
    if (!shiftResult.rows[0]) {
      throw Object.assign(new Error('الوردية غير موجودة'), { statusCode: 404 });
    }

    const stats = await pool.query<{
      sales_count: string;
      sales_total: string;
      cash_total: string;
      card_total: string;
      credit_total: string;
    }>(
      `SELECT
         COUNT(*)::bigint                                           AS sales_count,
         COALESCE(SUM(total_amount), 0)                            AS sales_total,
         COALESCE(SUM(CASE WHEN payment_method = 'cash'   THEN total_amount ELSE 0 END), 0) AS cash_total,
         COALESCE(SUM(CASE WHEN payment_method = 'card'   THEN total_amount ELSE 0 END), 0) AS card_total,
         COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN total_amount ELSE 0 END), 0) AS credit_total
       FROM sales WHERE shift_id = $1`,
      [id]
    );

    return {
      ...shiftResult.rows[0],
      sales_count: parseInt(stats.rows[0].sales_count, 10),
      sales_total: stats.rows[0].sales_total,
      cash_total:  stats.rows[0].cash_total,
      card_total:  stats.rows[0].card_total,
      credit_total:stats.rows[0].credit_total,
    } as ShiftSummary;
  }
}
