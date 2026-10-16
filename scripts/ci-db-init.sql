-- CI database initialisation — runs as superuser before migrations.
-- Creates app_user and grants the minimum required on the alinamatrix database.
-- AlinaMatrix Enterprise — Enterprise Candidate — Active Development

-- Create app_user role (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN PASSWORD 'app_user_dev';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE alinamatrix TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
