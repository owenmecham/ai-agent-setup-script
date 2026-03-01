import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 12;
const TOKEN_EXPIRY = '24h';

export class Auth {
  private jwtSecret: string;

  constructor(jwtSecret?: string) {
    this.jwtSecret = jwtSecret ?? randomBytes(64).toString('hex');
  }

  validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one digit');
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    return { valid: errors.length === 0, errors };
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  generateToken(payload: Record<string, unknown>): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn: TOKEN_EXPIRY });
  }

  verifyToken(token: string): Record<string, unknown> | null {
    try {
      return jwt.verify(token, this.jwtSecret) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
