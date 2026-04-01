import bcrypt from 'bcryptjs';
import { dbAll, dbGet, dbRun } from '../../shared/db/pool.js';

export interface UserPublic {
  id: string;
  username: string;
  full_name: string;
  role: string;
  is_active: boolean;
  is_protected: boolean;
  avatar_url: string | null;
  last_login_at: string | null;
  created_at: string;
}

const SELECT_FIELDS = `
  id, username, full_name, role, is_active, is_protected,
  avatar_url, last_login_at, created_at
`;

export class UsersService {
  async listUsers(): Promise<UserPublic[]> {
    return dbAll<UserPublic>(
      `SELECT ${SELECT_FIELDS} FROM users ORDER BY created_at ASC`
    );
  }

  async getUserById(id: number): Promise<UserPublic | null> {
    return dbGet<UserPublic>(
      `SELECT ${SELECT_FIELDS} FROM users WHERE id = $1`,
      [id]
    );
  }

  async createUser(data: {
    username: string;
    password: string;
    full_name: string;
    role: string;
  }): Promise<UserPublic> {
    const existing = await dbGet('SELECT id FROM users WHERE username = $1', [data.username]);
    if (existing) {
      const err = new Error('اسم المستخدم مستخدم بالفعل') as Error & { statusCode: number };
      err.statusCode = 409;
      throw err;
    }

    const password_hash = await bcrypt.hash(data.password, 10);

    const result = await dbRun(
      `INSERT INTO users (username, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [data.username, password_hash, data.full_name, data.role]
    );

    const newId = result.rows[0]?.id as number;
    return (await this.getUserById(newId))!;
  }

  async updateUser(
    id: number,
    data: { full_name?: string; role?: string; avatar_url?: string | null }
  ): Promise<UserPublic> {
    const user = await dbGet<{ is_protected: boolean }>(
      'SELECT is_protected FROM users WHERE id = $1',
      [id]
    );

    if (!user) {
      const err = new Error('المستخدم غير موجود') as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }

    if (user.is_protected && data.role !== undefined) {
      const err = new Error('لا يمكن تعديل دور هذا المستخدم المحمي') as Error & { statusCode: number };
      err.statusCode = 403;
      throw err;
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.full_name !== undefined) {
      fields.push(`full_name = $${idx++}`);
      values.push(data.full_name);
    }
    if (data.role !== undefined) {
      fields.push(`role = $${idx++}`);
      values.push(data.role);
    }
    if (data.avatar_url !== undefined) {
      fields.push(`avatar_url = $${idx++}`);
      values.push(data.avatar_url);
    }

    if (fields.length > 0) {
      fields.push('updated_at = NOW()');
      values.push(id);
      await dbRun(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`,
        values
      );
    }

    return (await this.getUserById(id))!;
  }

  async changePassword(id: number, newPassword: string): Promise<void> {
    const user = await dbGet('SELECT id FROM users WHERE id = $1', [id]);
    if (!user) {
      const err = new Error('المستخدم غير موجود') as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }

    const hash = await bcrypt.hash(newPassword, 10);

    await dbRun(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hash, id]
    );

    // إلغاء جميع جلسات المستخدم بعد تغيير كلمة المرور
    await dbRun('DELETE FROM user_sessions WHERE user_id = $1', [id]);
  }

  async toggleActive(id: number, requestingUserId: string): Promise<UserPublic> {
    if (String(id) === requestingUserId) {
      const err = new Error('لا يمكنك تعطيل حسابك الخاص') as Error & { statusCode: number };
      err.statusCode = 400;
      throw err;
    }

    const user = await dbGet<{ is_protected: boolean; is_active: boolean }>(
      'SELECT is_protected, is_active FROM users WHERE id = $1',
      [id]
    );

    if (!user) {
      const err = new Error('المستخدم غير موجود') as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }

    if (user.is_protected) {
      const err = new Error('لا يمكن تغيير حالة هذا المستخدم المحمي') as Error & { statusCode: number };
      err.statusCode = 403;
      throw err;
    }

    await dbRun(
      'UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2',
      [!user.is_active, id]
    );

    // إلغاء جلسات المستخدم إذا تم تعطيله
    if (user.is_active) {
      await dbRun('DELETE FROM user_sessions WHERE user_id = $1', [id]);
    }

    return (await this.getUserById(id))!;
  }
}
