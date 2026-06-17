/**
 * Claims carried by a short-TTL playback token. Minted by the platform (or the
 * service-authed mint endpoint) AFTER the platform runs its own enrollment /
 * "can this viewer watch this video" check. This service trusts the signature
 * and the binding; it does not re-run enrollment. When folded into the SaaS,
 * the only change is WHO mints the token, the verification stays identical.
 */
export interface PlaybackTokenClaims {
  tenantId: string;
  userId: string;
  videoId: string;
  iat?: number;
  exp?: number;
}
