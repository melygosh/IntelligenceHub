import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { category } from '../db/schema';
import type { Category } from '@intelligencehub/shared';

const MAX_CATEGORIES_PER_USER = 20;

@Injectable()
export class CategoriesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listMine(userId: string): Promise<Category[]> {
    const rows = await this.db
      .select({
        id: category.id,
        name: category.name,
        createdAt: category.createdAt,
      })
      .from(category)
      .where(eq(category.userId, userId))
      .orderBy(asc(category.createdAt));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async create(userId: string, rawName: string): Promise<Category> {
    const name = rawName.normalize('NFKC').trim();
    if (name === '') {
      throw new HttpException({ error: 'invalid_name' }, HttpStatus.BAD_REQUEST);
    }
    const existing = await this.listMine(userId);
    if (existing.length >= MAX_CATEGORIES_PER_USER) {
      throw new HttpException({ error: 'too_many_categories' }, HttpStatus.CONFLICT);
    }
    try {
      const [row] = await this.db
        .insert(category)
        .values({ userId, name })
        .returning({
          id: category.id,
          name: category.name,
          createdAt: category.createdAt,
        });
      return {
        id: row.id,
        name: row.name,
        createdAt: row.createdAt.toISOString(),
      };
    } catch (err) {
      const cause = (err as { cause?: { code?: string; constraint?: string } }).cause;
      if (cause?.code === '23505' && cause.constraint === 'category_user_name_unique') {
        throw new ConflictException({ error: 'duplicate_name' });
      }
      throw err;
    }
  }

  async delete(userId: string, id: string): Promise<void> {
    const result = await this.db
      .delete(category)
      .where(and(eq(category.userId, userId), eq(category.id, id)))
      .returning({ id: category.id });
    if (result.length === 0) {
      throw new NotFoundException('Category not found');
    }
  }
}
