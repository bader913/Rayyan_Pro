/**
 * خدمة حركات المخزون الموحّدة
 *
 * جميع التغييرات على stock_quantity تمر عبر هذه الدالة حصراً.
 * لا يُسمح بأي UPDATE مباشر على stock_quantity خارج هذا الملف.
 *
 * تعمل داخل transaction خارجية (withTransaction) لضمان الاتساق.
 */

import type pg from 'pg';
import { detectLowStockTransition, type LowStockTransitionEvent } from '../../modules/notifications/lowStockAlerts.service.js';

export type MovementType =
  | 'purchase'       // شراء: دخول من مورد
  | 'sale'           // بيع: خروج لعميل
  | 'return_in'      // مرتجع بيع: عودة للمخزون
  | 'return_out'     // مرتجع شراء: خروج للمورد
  | 'adjustment_in'  // تعديل إدخال: جرد أو تصحيح
  | 'adjustment_out' // تعديل إخراج: جرد أو تصحيح
  | 'initial'        // رصيد افتتاحي
  | 'damage'         // تالف أو منتهي الصلاحية
  | 'transfer_in'    // تحويل وارد
  | 'transfer_out';  // تحويل صادر

export interface StockMovementOptions {
  product_id: number;
  movement_type: MovementType;
  /**
   * موجب = دخول للمخزون، سالب = خروج
   * مثال: شراء 10 وحدات → quantity_change = +10
   * مثال: بيع 3 وحدات → quantity_change = -3
   */
  quantity_change: number;
  reference_id?: number;
  reference_type?:
    | 'sale'
    | 'purchase'
    | 'sale_return'
    | 'purchase_return'
    | 'adjustment'
    | 'stock_transfer'
    | 'stock_count_session';
  note?: string;
  created_by?: number;
  suppress_low_stock_detection?: boolean;
}

export interface StockMovementResult {
  quantity_before: number;
  quantity_after: number;
  low_stock_event: LowStockTransitionEvent | null;
}

/**
 * يسجّل حركة مخزون ويحدّث الكمية المتاحة للمنتج.
 * يجب استدعاؤها داخل transaction نشطة.
 */
export async function recordStockMovement(
  client: pg.PoolClient,
  options: StockMovementOptions
): Promise<StockMovementResult> {
  const {
    product_id,
    movement_type,
    quantity_change,
    suppress_low_stock_detection = false,
  } = options;

  // قفل الصف لمنع التعارض (SELECT FOR UPDATE)
  const productResult = await client.query<{
    stock_quantity: string;
    name: string;
    min_stock_level: string;
  }>(
    'SELECT stock_quantity, name, min_stock_level FROM products WHERE id = $1 FOR UPDATE',
    [product_id]
  );

  if (!productResult.rows[0]) {
    throw Object.assign(new Error(`المنتج رقم ${product_id} غير موجود`), { statusCode: 404 });
  }

  const quantity_before = parseFloat(productResult.rows[0].stock_quantity);
  const quantity_after = quantity_before + quantity_change;
  const min_stock_level = parseFloat(productResult.rows[0].min_stock_level || '0');

  if (quantity_after < 0) {
    throw Object.assign(
      new Error(
        `لا يمكن إتمام الحركة على المنتج "${productResult.rows[0].name}" لأن المخزون غير كافٍ. المتوفر: ${quantity_before.toFixed(3)}`
      ),
      { statusCode: 409 }
    );
  }

  // تحديث الكمية
  await client.query(
    'UPDATE products SET stock_quantity = $1, updated_at = NOW() WHERE id = $2',
    [quantity_after, product_id]
  );

  // تسجيل الحركة
  await client.query(
    `INSERT INTO product_stock_movements
       (product_id, movement_type, quantity_change, quantity_before, quantity_after,
        reference_id, reference_type, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      product_id,
      movement_type,
      quantity_change,
      quantity_before,
      quantity_after,
      options.reference_id ?? null,
      options.reference_type ?? null,
      options.note ?? null,
      options.created_by ?? null,
    ]
  );

  const low_stock_event = suppress_low_stock_detection
    ? null
    : await detectLowStockTransition(client, {
        productId: product_id,
        productName: productResult.rows[0].name,
        quantityBefore: quantity_before,
        quantityAfter: quantity_after,
        minStockLevel: min_stock_level,
        movementType: movement_type,
        userId: options.created_by,
      });

  return {
    quantity_before,
    quantity_after,
    low_stock_event,
  };
}