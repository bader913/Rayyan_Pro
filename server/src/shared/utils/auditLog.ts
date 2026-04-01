import { dbRun } from '../db/pool.js';

interface AuditOptions {
  userId:     number | null;
  action:     string;          // 'create' | 'update' | 'delete' | 'login' | 'logout' | 'payment' ...
  entityType: string;          // 'user' | 'product' | 'sale' | 'purchase' | 'customer' | 'supplier' ...
  entityId?:  number | null;
  oldData?:   object | null;
  newData?:   object | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function auditLog(opts: AuditOptions): Promise<void> {
  try {
    await dbRun(
      `INSERT INTO audit_logs
         (user_id, action, entity_type, entity_id, old_data, new_data, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        opts.userId   ?? null,
        opts.action,
        opts.entityType,
        opts.entityId ?? null,
        opts.oldData   ? JSON.stringify(opts.oldData)  : null,
        opts.newData   ? JSON.stringify(opts.newData)  : null,
        opts.ipAddress ?? null,
        opts.userAgent ?? null,
      ]
    );
  } catch {
    // audit log failure should NEVER crash the main flow
  }
}
