import { z } from 'zod';

export const Category = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(64),
  createdAt: z.string().datetime(),
});
export type Category = z.infer<typeof Category>;

export const CategoryList = z.object({
  categories: z.array(Category),
});
export type CategoryList = z.infer<typeof CategoryList>;

export const CreateCategoryRequest = z.object({
  name: z.string().min(1).max(64),
});
export type CreateCategoryRequest = z.infer<typeof CreateCategoryRequest>;

export const UpdateCategoryRequest = z.object({
  name: z.string().min(1).max(64),
});
export type UpdateCategoryRequest = z.infer<typeof UpdateCategoryRequest>;
