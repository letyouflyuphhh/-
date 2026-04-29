export function isAuthorized(expectedToken: string, providedToken: string | string[] | undefined): boolean {
  if (!expectedToken) {
    return false;
  }

  if (Array.isArray(providedToken)) {
    return providedToken.includes(expectedToken);
  }

  return providedToken === expectedToken;
}
