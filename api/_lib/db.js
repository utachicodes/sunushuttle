import { neon } from '@neondatabase/serverless';

let client;

function getClient() {
  if (!client) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not configured');
    client = neon(connectionString);
  }
  return client;
}

export function sql(strings, ...values) {
  return getClient()(strings, ...values);
}

/** Runs several tagged-template queries as one atomic transaction. */
export function transaction(queries) {
  return getClient().transaction(queries);
}
