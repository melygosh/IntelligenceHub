export type JwtPayload = {
  sub: string; // user id
  email: string;
};

export const AUTH_COOKIE_NAME = 'ih_auth';
