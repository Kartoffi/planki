import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool, Client } = pg;

const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
});


// Create users table if it doesn't exist
const tableResult = await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    discord_id VARCHAR NOT NULL,
    color_role_id VARCHAR
  )
`);

// Add unique constraint to discord_id if it doesn't exist
await pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'users_discord_id_unique'
    ) THEN
      ALTER TABLE users ADD CONSTRAINT users_discord_id_unique UNIQUE (discord_id);
    END IF;
  END
  $$;
`);

const db = new Client({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
});

await db.connect();

export { db };