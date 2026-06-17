import type { PlaybackTokenClaims } from "../types/auth.type";

declare global {
   
  namespace Express {
    interface Request {
      /** Set by requireServiceAuth when a valid service key is presented. */
      service?: boolean;
      /** Tenant context (X-Tenant-Id header for service calls, or token claim). */
      tenantId?: string;
      /** Set by requirePlaybackToken, verified playback token claims. */
      playback?: PlaybackTokenClaims;
    }
  }
}

export {};
