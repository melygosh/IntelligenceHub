import {z} from 'zod';

export const RegisterRequest = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  loadDemoData: z.boolean().default(false),
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
  emailConfirmed: z.boolean(),
  createdAt: z.string().datetime(),
});
export type UserResponse = z.infer<typeof UserResponse>;

export const AuthResponse = z.object({
  user: UserResponse,
  devModeConfirmLink: z.string().url().optional(),
});
export type AuthResponse = z.infer<typeof AuthResponse>;

export const ConfirmEmailRequest = z.object({
  token: z.string().min(20).max(100),
});
export type ConfirmEmailRequest = z.infer<typeof ConfirmEmailRequest>;

export const ConfirmEmailResponse = z.object({
  user: UserResponse,
});
export type ConfirmEmailResponse = z.infer<typeof ConfirmEmailResponse>;

export const ResendConfirmationResponse = z.object({
  devModeConfirmLink: z.string().url().optional(),
});
export type ResendConfirmationResponse = z.infer<typeof ResendConfirmationResponse>;
