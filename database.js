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
await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    discord_id VARCHAR NOT NULL,
    color_role_id VARCHAR
  )
`);

// create settings table if it doesn't exist
await pool.query(`
  CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    setting_id VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    value VARCHAR NOT NULL,
    type VARCHAR NOT NULL DEFAULT 'string',
    setting_is_active BOOLEAN DEFAULT TRUE
  )
`);

// Add unique constraint to name in settings if it doesn't exist
await pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'settings_id_unique'
    ) THEN
      ALTER TABLE settings ADD CONSTRAINT settings_id_unique UNIQUE (setting_id);
    END IF;
  END
  $$;
`);

// insert into settings table
await pool.query(`
  INSERT INTO settings (setting_id, name, value, type, setting_is_active)
  VALUES ('remove_users_by_account_age', 'Entferne neue User, deren Account unter X Tage alt ist', 14, 'number', TRUE)
  ON CONFLICT (setting_id) DO NOTHING;
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