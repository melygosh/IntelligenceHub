import { Global, Module } from '@nestjs/common';
import { createDb, type Db } from './client';

export const DB = Symbol('DB');

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: (): Db => createDb(),
    },
  ],
  exports: [DB],
})
export class DbModule {}
