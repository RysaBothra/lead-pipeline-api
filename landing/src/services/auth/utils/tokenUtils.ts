export function calculateTokenExpiry(token: string): number {
  try {
    if (!token || token.split('.').length !== 3) {
      return Date.now() + 15 * 60 * 1000;  // Default to 15 minutes from now
    }

    const base64Url = token.split('.')[1];
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');

    while (base64.length % 4) {
      base64 += '=';
    }

    const jsonPayload = atob(base64);
    const payload = JSON.parse(jsonPayload);

    if (payload.exp) {
      const expiryTime = payload.exp * 1000;
      const now = Date.now();

      if (expiryTime <= now || expiryTime > now + 25 * 60 * 60 * 1000) {
        return now + 24 * 60 * 60 * 1000;
      }

      return expiryTime;
    }

    if (payload.iat) {
      const issuedAtTime = payload.iat * 1000;
      const now = Date.now();
      const effectiveIssueTime = issuedAtTime > now ? now : issuedAtTime;

      return effectiveIssueTime + 24 * 60 * 60 * 1000;
    }
  } catch (error) {
    // Silent error handling
  }

  return Date.now() + 24 * 60 * 60 * 1000;
}