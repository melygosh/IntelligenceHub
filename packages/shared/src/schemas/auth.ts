import {z} from 'zod';

export const RegisterRequest = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type RegisterRequest = z.infer<typeof RegisterRequest>;

export const LoginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const UserResponse = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
});
export type UserResponse = z.infer<typeof UserResponse>;

export const AuthResponse = z.object({
  user: UserResponse,
});
export type AuthResponse = z.infer<typeof AuthResponse>;
