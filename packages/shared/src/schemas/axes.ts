import { z } from 'zod';

export const AxisValue = z.object({
  id: z.string().uuid(),
  value: z.string().min(1).max(64),
  position: z.number().int(),
});
export type AxisValue = z.infer<typeof AxisValue>;

export const Axis = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(64),
  position: z.number().int(),
  values: z.array(AxisValue).max(20),
});
export type Axis = z.infer<typeof Axis>;

export const AxisList = z.object({
  axes: z.array(Axis),
});
export type AxisList = z.infer<typeof AxisList>;

export const CreateAxisRequest = z.object({
  name: z.string().min(1).max(64),
  values: z.array(z.string().min(1).max(64)).min(1).max(20),
});
export type CreateAxisRequest = z.infer<typeof CreateAxisRequest>;

export const UpdateAxisRequest = z.object({
  name: z.string().min(1).max(64).optional(),
  values: z.array(z.string().min(1).max(64)).max(20).optional(),
});
export type UpdateAxisRequest = z.infer<typeof UpdateAxisRequest>;
