import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { dbGet, dbRun } from '../../shared/db/pool.js';

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  full_name: string;
  role: string;
  is_active: boolean;
  avatar_url: string | null;
}

export class AuthService {
  constructor(private fastify: FastifyInstance) {}

  async login(username: string, password: string, request: FastifyRequest) {
    const user = await dbGet<UserRow>(
      'SELECT id, username, password_hash, full_name, role, is_active, avatar_url FROM users WHERE username = $1',
      [username]
    );

    if (!user || !user.is_active) {
      const err = new Error('اسم المستخدم أو كلمة المرور غير صحيحة') as Error & { statusCode: number };
      err.statusCode = 401;
      throw err;
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      const err = new Error('اسم المستخدم أو كلمة المرور غير صحيحة') as Error & { statusCode: number };
      err.statusCode = 401;
      throw err;
    }

    const payload = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
    };

    const accessToken = this.fastify.jwt.sign(payload, {
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    });

    // TODO (إنتاج): يجب إرسال refresh_token عبر httpOnly Secure Cookie
    // بدلاً من إعادته في body الاستجابة، لمنع هجمات XSS.
    // مثال: reply.setCookie('refresh_token', token, { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/auth' })
    // في التطوير: الإرسال في body مقبول مؤقتاً.
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await dbRun(
      `INSERT INTO user_sessions (user_id, refresh_token, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.id,
        refreshToken,
        request.ip,
        request.headers['user-agent'] ?? null,
        expiresAt,
      ]
    );

    await dbRun('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    return {
      success: true,
      access_token: accessToken,
      refresh_token: refreshToken,
      user: payload,
    };
  }

  async refreshToken(token: string) {
    const session = await dbGet<{
      user_id: number;
      expires_at: Date;
      username: string;
      full_name: string;
      role: string;
    }>(
      `SELECT s.user_id, s.expires_at, u.username, u.full_name, u.role
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.refresh_token = $1 AND u.is_active = TRUE`,
      [token]
    );

    if (!session || new Date() > new Date(session.expires_at)) {
      const err = new Error('جلسة غير صالحة أو منتهية') as Error & { statusCode: number };
      err.statusCode = 401;
      throw err;
    }

    const payload = {
      id: session.user_id,
      username: session.username,
      full_name: session.full_name,
      role: session.role,
    };

    const accessToken = this.fastify.jwt.sign(payload, {
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    });

    return {
      success: true,
      access_token: accessToken,
      user: payload,
    };
  }

  async logout(refreshToken: string) {
    await dbRun('DELETE FROM user_sessions WHERE refresh_token = $1', [refreshToken]);
  }
}
