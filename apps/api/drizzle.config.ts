import 'dotenv/config';
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://intelligencehub:replace_me_for_local@localhost:5432/intelligencehub',
  },
  strict: true,
  verbose: true,
} satisfies Config;
