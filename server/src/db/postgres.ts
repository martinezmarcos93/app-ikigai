import type { Pool } from "pg";
import type { Database, QueryResult, TransactionalDatabase } from "./db.js";

export class PostgresDatabase implements TransactionalDatabase {
  constructor(private readonly pool: Pool) {}

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values: unknown[] = []
  ): Promise<QueryResult<Row>> {
    const result = await this.pool.query(sql, values);
    return { rows: result.rows as Row[], rowCount: result.rowCount };
  }

  async transaction<T>(work: (transaction: Database) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const transactionDb: Database = {
        async query<Row extends Record<string, unknown> = Record<string, unknown>>(
          sql: string,
          values: unknown[] = []
        ): Promise<QueryResult<Row>> {
          const result = await client.query(sql, values);
          return { rows: result.rows as Row[], rowCount: result.rowCount };
        }
      };
      const result = await work(transactionDb);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
