#!/usr/bin/env node
/**
 * Apply supabase/migrations/0001_init.sql to the Supabase project.
 *
 * Provide ONE of these (the anon key cannot run DDL, so an elevated credential
 * is required just once):
 *
 *   A) Supabase personal access token (recommended, no DB password needed):
 *        SUPABASE_ACCESS_TOKEN=sbp_xxx  SUPABASE_PROJECT_REF=ciprjkzxtrkhxsbfrpvu \
 *        node scripts/apply-migration.mjs
 *
 *   B) Postgres connection string (Supabase → Settings → Database → Connection string):
 *        DATABASE_URL="postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres" \
 *        node scripts/apply-migration.mjs
 *
 * After it succeeds, open the app and click "Load demo data".
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, "..", "supabase", "migrations", "0001_init.sql");
const sql = await readFile(sqlPath, "utf-8");

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF || "ciprjkzxtrkhxsbfrpvu";
const dbUrl = process.env.DATABASE_URL;

if (token) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Management API ${res.status}: ${text.slice(0, 500)}`);
    process.exit(1);
  }
  console.log("Migration applied via Management API.");
  process.exit(0);
} else if (dbUrl) {
  const { default: pg } = await import("pg").catch(() => ({ default: null }));
  if (!pg) {
    console.error('Install the pg client first: npm i pg');
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log("Migration applied via direct Postgres connection.");
  process.exit(0);
} else {
  console.error(
    "No credential provided. Set SUPABASE_ACCESS_TOKEN (+ SUPABASE_PROJECT_REF) or DATABASE_URL.",
  );
  process.exit(1);
}
