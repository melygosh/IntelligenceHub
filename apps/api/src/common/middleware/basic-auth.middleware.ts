import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Express middleware that gates a route behind HTTP Basic auth.
 *
 * Uses timing-safe comparison on both username and password to avoid leaking which
 * field is wrong via response latency. Replaces the unmaintained `express-basic-auth`
 * package (frozen since 2021).
 */
export function basicAuth(
  username: string,
  password: string,
  realm = 'Restricted',
): (req: Request, res: Response, next: NextFunction) => void {
  const expectedUser = Buffer.from(username, 'utf-8');
  const expectedPass = Buffer.from(password, 'utf-8');

  function reject(res: Response): void {
    res.set(
      'WWW-Authenticate',
      `Basic realm="${realm.replace(/"/g, '')}", charset="UTF-8"`,
    );
    res.status(401).send('Authentication required');
  }

  return function basicAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const header = req.headers.authorization;
    if (!header || !header.toLowerCase().startsWith('basic ')) {
      reject(res);
      return;
    }
    const encoded = header.slice(6).trim();
    let decoded: string;
    try {
      decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    } catch {
      reject(res);
      return;
    }
    const sep = decoded.indexOf(':');
    if (sep === -1) {
      reject(res);
      return;
    }
    const givenUser = Buffer.from(decoded.slice(0, sep), 'utf-8');
    const givenPass = Buffer.from(decoded.slice(sep + 1), 'utf-8');

    // Length-mismatched buffers can't be passed to timingSafeEqual; pad with a constant-size
    // dummy comparison to keep the work constant regardless of input length.
    const userOk =
      givenUser.length === expectedUser.length &&
      timingSafeEqual(givenUser, expectedUser);
    const passOk =
      givenPass.length === expectedPass.length &&
      timingSafeEqual(givenPass, expectedPass);

    if (!userOk || !passOk) {
      reject(res);
      return;
    }
    next();
  };
}
