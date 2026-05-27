import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { TelemetrySummary } from '@intelligencehub/shared';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { llmCalls } from '../db/schema';
import { computeCost, lookupPricing } from '../llm/llm-pricing';

@Injectable()
export class TelemetryService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async summary(userId: string): Promise<TelemetrySummary> {
    const rows = await this.db
      .select({
        operation: llmCalls.operation,
        provider: llmCalls.provider,
        model: llmCalls.model,
        callCount: sql<number>`COUNT(*)::int`,
        inputTokens: sql<number>`COALESCE(SUM(${llmCalls.inputTokens}), 0)::int`,
        outputTokens: sql<number>`COALESCE(SUM(${llmCalls.outputTokens}), 0)::int`,
        cacheReadTokens: sql<number>`COALESCE(SUM(${llmCalls.cacheReadTokens}), 0)::int`,
        cacheCreationTokens: sql<number>`COALESCE(SUM(${llmCalls.cacheCreationTokens}), 0)::int`,
        avgLatencyMs: sql<number>`COALESCE(AVG(${llmCalls.latencyMs}), 0)::int`,
        successCount: sql<number>`SUM(CASE WHEN ${llmCalls.status} = 'success' THEN 1 ELSE 0 END)::int`,
        failoverCount: sql<number>`SUM(CASE WHEN ${llmCalls.failoverReason} IS NOT NULL THEN 1 ELSE 0 END)::int`,
      })
      .from(llmCalls)
      .where(eq(llmCalls.userId, userId))
      .groupBy(llmCalls.operation, llmCalls.provider, llmCalls.model)
      .orderBy(
        sql`SUM(${llmCalls.inputTokens} + ${llmCalls.outputTokens}) DESC`,
      );

    const [dateRangeRow] = await this.db
      .select({
        fromTs: sql<Date | null>`MIN(${llmCalls.createdAt})`,
        toTs: sql<Date | null>`MAX(${llmCalls.createdAt})`,
      })
      .from(llmCalls)
      .where(eq(llmCalls.userId, userId));

    let totalCostUsd = 0;
    let unknownModelCount = 0;
    const enrichedRows = rows.map((r) => {
      const pricing = lookupPricing(r.model);
      let costUsd: number | null = null;
      if (pricing) {
        costUsd = computeCost(r, pricing);
        totalCostUsd += costUsd;
      } else {
        unknownModelCount += r.callCount;
      }
      return {
        operation: r.operation,
        provider: r.provider,
        model: r.model,
        callCount: r.callCount,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cacheReadTokens: r.cacheReadTokens,
        cacheCreationTokens: r.cacheCreationTokens,
        costUsd,
        avgLatencyMs: r.avgLatencyMs,
        successRate: r.callCount === 0 ? 1 : r.successCount / r.callCount,
        failoverCount: r.failoverCount,
      };
    });

    return {
      rows: enrichedRows,
      totalCostUsd,
      totalCalls: rows.reduce((s, r) => s + r.callCount, 0),
      unknownModelCount,
      dateRange: {
        from: dateRangeRow?.fromTs
          ? new Date(dateRangeRow.fromTs).toISOString()
          : null,
        to: dateRangeRow?.toTs
          ? new Date(dateRangeRow.toTs).toISOString()
          : null,
      },
    };
  }
}
