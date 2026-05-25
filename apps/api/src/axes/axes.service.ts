import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { axis, axisValue } from '../db/schema';
import type { Axis } from '@intelligencehub/shared';

const MAX_AXES_PER_USER = 10;
const MAX_VALUES_PER_AXIS = 20;

@Injectable()
export class AxesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listMine(userId: string): Promise<Axis[]> {
    const axisRows = await this.db
      .select({
        id: axis.id,
        name: axis.name,
        position: axis.position,
      })
      .from(axis)
      .where(eq(axis.userId, userId))
      .orderBy(asc(axis.position), asc(axis.name));
    if (axisRows.length === 0) return [];

    const ids = axisRows.map((a) => a.id);
    const valueRows = await this.db
      .select({
        id: axisValue.id,
        axisId: axisValue.axisId,
        value: axisValue.value,
        position: axisValue.position,
      })
      .from(axisValue)
      .where(inArray(axisValue.axisId, ids))
      .orderBy(asc(axisValue.position), asc(axisValue.value));

    const byAxis = new Map<string, Axis['values']>();
    for (const v of valueRows) {
      const list = byAxis.get(v.axisId) ?? [];
      list.push({ id: v.id, value: v.value, position: v.position });
      byAxis.set(v.axisId, list);
    }

    return axisRows.map((a) => ({
      id: a.id,
      name: a.name,
      position: a.position,
      values: byAxis.get(a.id) ?? [],
    }));
  }

  async create(userId: string, rawName: string, rawValues: string[]): Promise<Axis> {
    const name = rawName.normalize('NFKC').trim();
    if (name === '') {
      throw new HttpException({ error: 'invalid_name' }, HttpStatus.BAD_REQUEST);
    }
    const values = this.dedupValues(rawValues);
    if (values.length === 0) {
      throw new HttpException({ error: 'at_least_one_value_required' }, HttpStatus.BAD_REQUEST);
    }
    if (values.length > MAX_VALUES_PER_AXIS) {
      throw new HttpException({ error: 'too_many_values' }, HttpStatus.CONFLICT);
    }
    const existing = await this.listMine(userId);
    if (existing.length >= MAX_AXES_PER_USER) {
      throw new HttpException({ error: 'too_many_axes' }, HttpStatus.CONFLICT);
    }
    const nextPosition = existing.length;

    try {
      const [axisRow] = await this.db
        .insert(axis)
        .values({ userId, name, position: nextPosition })
        .returning({ id: axis.id, name: axis.name, position: axis.position });

      const valueRows = await this.db
        .insert(axisValue)
        .values(values.map((v, i) => ({ axisId: axisRow.id, value: v, position: i })))
        .returning({ id: axisValue.id, value: axisValue.value, position: axisValue.position });

      return {
        id: axisRow.id,
        name: axisRow.name,
        position: axisRow.position,
        values: valueRows.map((v) => ({ id: v.id, value: v.value, position: v.position })),
      };
    } catch (err) {
      const cause = (err as { cause?: { code?: string; constraint?: string } }).cause;
      if (cause?.code === '23505' && cause.constraint === 'axis_user_name_unique') {
        throw new ConflictException({ error: 'duplicate_name' });
      }
      throw err;
    }
  }

  async update(
    userId: string,
    id: string,
    patch: { name?: string; values?: string[] },
  ): Promise<Axis> {
    const [existing] = await this.db
      .select({ id: axis.id })
      .from(axis)
      .where(and(eq(axis.id, id), eq(axis.userId, userId)))
      .limit(1);
    if (!existing) throw new NotFoundException('Axis not found');

    if (patch.name !== undefined) {
      const name = patch.name.normalize('NFKC').trim();
      if (name === '') {
        throw new HttpException({ error: 'invalid_name' }, HttpStatus.BAD_REQUEST);
      }
      try {
        await this.db.update(axis).set({ name }).where(eq(axis.id, id));
      } catch (err) {
        const cause = (err as { cause?: { code?: string; constraint?: string } }).cause;
        if (cause?.code === '23505' && cause.constraint === 'axis_user_name_unique') {
          throw new ConflictException({ error: 'duplicate_name' });
        }
        throw err;
      }
    }

    if (patch.values !== undefined) {
      const values = this.dedupValues(patch.values);
      if (values.length === 0) {
        throw new HttpException({ error: 'at_least_one_value_required' }, HttpStatus.BAD_REQUEST);
      }
      if (values.length > MAX_VALUES_PER_AXIS) {
        throw new HttpException({ error: 'too_many_values' }, HttpStatus.CONFLICT);
      }
      // Full replacement: delete all values for this axis, insert new ones.
      // Cascade delete propagates to article_axis_value automatically.
      await this.db.delete(axisValue).where(eq(axisValue.axisId, id));
      await this.db
        .insert(axisValue)
        .values(values.map((v, i) => ({ axisId: id, value: v, position: i })));
    }

    const all = await this.listMine(userId);
    const result = all.find((a) => a.id === id);
    if (!result) throw new NotFoundException('Axis not found after update');
    return result;
  }

  async delete(userId: string, id: string): Promise<void> {
    const result = await this.db
      .delete(axis)
      .where(and(eq(axis.userId, userId), eq(axis.id, id)))
      .returning({ id: axis.id });
    if (result.length === 0) throw new NotFoundException('Axis not found');
  }

  private dedupValues(raw: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of raw) {
      const v = r.normalize('NFKC').trim();
      if (v === '') continue;
      const key = v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out;
  }
}
