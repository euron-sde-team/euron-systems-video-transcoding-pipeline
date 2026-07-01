// PORTED: now also lives in euron-systems-user-server/src/services/
// playback-token.service.ts (the SaaS mints tokens after its enrollment check).
// Kept here for reference / standalone operator use (deprecate-don't-delete).
import jwt from "jsonwebtoken";
import config from "../config";
import { UnauthorizedError } from "../errors/unauthorized.error";
import type { PlaybackTokenClaims } from "../types/auth.type";

interface MintInput {
  tenantId: string;
  userId: string;
  videoId: string;
  ttlSeconds?: number;
}

interface MintResult {
  token: string;
  expiresAt: string;
  ttlSeconds: number;
}

/**
 * Mints + verifies HS256 playback tokens. This is the integration seam: today
 * the service-authed mint endpoint issues them; tomorrow the SaaS user-server
 * mints them with the same secret after its enrollment check. Verification is
 * unchanged either way.
 */
class PlaybackTokenService {
  mint({ tenantId, userId, videoId, ttlSeconds }: MintInput): MintResult {
    const requested = ttlSeconds ?? config.PLAYBACK_TOKEN_TTL_SECONDS;
    const ttl = Math.max(10, Math.min(requested, config.PLAYBACK_TOKEN_MAX_TTL_SECONDS));
    const token = jwt.sign({ tenantId, userId, videoId }, config.PLAYBACK_TOKEN_SECRET, {
      algorithm: "HS256",
      expiresIn: ttl,
    });
    return {
      token,
      ttlSeconds: ttl,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  verify(token: string): PlaybackTokenClaims {
    try {
      return jwt.verify(token, config.PLAYBACK_TOKEN_SECRET, {
        algorithms: ["HS256"],
      }) as PlaybackTokenClaims;
    } catch {
      throw new UnauthorizedError("Invalid or expired playback token");
    }
  }
}

export default new PlaybackTokenService();
