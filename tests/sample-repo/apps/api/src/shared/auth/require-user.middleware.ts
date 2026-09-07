/**
 * Reads the `sid` cookie and resolves the signed-in user id.
 * Returns null when there is no session; callers answer 401.
 */
export function requireUser(req: Request): string | null {
  const cookie = req.headers.get('cookie') ?? '';
  const match = /(?:^|;\s*)sid=([^;]+)/.exec(cookie);
  return match ? match[1] : null;
}
