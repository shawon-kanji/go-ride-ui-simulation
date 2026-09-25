import { z } from 'zod';

// Copied from the Expo apps' features/auth/schemas.ts, which mirror go-ride-backend's
// validate tags for both riders and drivers — don't add stricter client-side rules.
export const signupSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  first_name: z.string().trim().min(2, 'First name needs at least 2 characters').max(100),
  last_name: z.string().trim().min(2, 'Last name needs at least 2 characters').max(100),
});
export type SignupFormValues = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
export type LoginFormValues = z.infer<typeof loginSchema>;
