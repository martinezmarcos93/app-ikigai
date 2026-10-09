export interface QueryResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  rows: Row[];
  rowCount: number | null;
}

export interface Database {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ): Promise<QueryResult<Row>>;
}

export interface TransactionalDatabase extends Database {
  transaction<T>(work: (transaction: Database) => Promise<T>): Promise<T>;
}
