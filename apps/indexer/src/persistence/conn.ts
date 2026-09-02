/**
 * A connection a persistence function can write through: the pool itself, or
 * the handle `sql.begin` gives a transaction callback (HANDOFF-12).
 *
 * postgres.js types the two separately, and until the runtime wrote one
 * block as one transaction every writer here took the pool type alone - which
 * was never wrong, only narrower than what they do: every one of them is a
 * single tagged-template query, and both handles run those identically. The
 * runtime's `PostgresChainStore.writeBlock` is the first caller that needs the
 * six writes of one block to commit or fail together, and it hands them the
 * transaction handle.
 */
import type { Sql, TransactionSql } from "postgres";

export type Conn = Sql | TransactionSql;
