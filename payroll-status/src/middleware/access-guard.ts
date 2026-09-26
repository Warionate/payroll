import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config.js';

const JWKS = config.cfAccessTeamDomain
  ? createRemoteJWKSet(new URL(`https://${config.cfAccessTeamDomain}/cdn-cgi/access/certs`))
  : null;

const ISSUER = config.cfAccessTeamDomain
  ? `https://${config.cfAccessTeamDomain}`
  : '';

function extractToken(req: Request): string | null {
  const header = req.headers['cf-access-jwt-assertion'];
  if (typeof header === 'string' && header) return header;

  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === 'CF_Authorization' && rest.length > 0) {
      return rest.join('=');
    }
  }
  return null;
}

/**
 * 開発用の素通しを許可してよいリクエストか。
 *
 * 本番は cloudflared 経由なので、外部からのリクエストもすべて 127.0.0.1 から届く。
 * NODE_ENV の付け忘れだけで管理画面が認証なしになるのを防ぐため、
 * 明示的な ADMIN_DEV_BYPASS・非 production・Cloudflare を経由していない
 * （cf-connecting-ip / cf-ray ヘッダーが無い）の全条件を満たすときだけ許可する。
 */
function isDevBypassAllowed(req: Request): boolean {
  if (!config.adminDevBypass || config.nodeEnv === 'production') return false;
  if (req.headers['cf-connecting-ip'] || req.headers['cf-ray']) return false;
  return true;
}

/**
 * Admin アクセスは Cloudflare Access の JWT を必須とする。
 *
 * - Header `Cf-Access-Jwt-Assertion` または Cookie `CF_Authorization` から JWT を取り出し、
 *   Cloudflare の JWKS で署名検証 + `iss` / `aud` claim を検証する。
 * - 開発時は isDevBypassAllowed() の条件で localhost からのアクセスを素通しする。
 */
export async function accessGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (isDevBypassAllowed(req)) {
    const socketIp = req.socket.remoteAddress || '';
    const localhostIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
    if (localhostIps.includes(socketIp)) {
      next();
      return;
    }
  }

  if (!JWKS || !config.cfAccessAud) {
    res.status(503).json({ error: 'Access not configured' });
    return;
  }

  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: config.cfAccessAud,
    });
    next();
  } catch {
    res.status(403).json({ error: 'Invalid Access token' });
  }
}
