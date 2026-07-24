-- ============================================================
-- Cookie consent / preferences – database schema (optional)
-- Use this if you want to store cookie consent in your database.
-- ============================================================

-- Table: cookie_consent
-- Stores user cookie consent preferences (e.g. from a consent banner).
-- You can link to users by user_id or use session_id for anonymous visitors.

CREATE TABLE IF NOT EXISTS cookie_consent (
  id            SERIAL PRIMARY KEY,
  session_id    VARCHAR(255) NOT NULL,           -- browser session or anonymous id
  user_id       INTEGER NULL,                    -- optional: link to users table
  essential     BOOLEAN NOT NULL DEFAULT TRUE,   -- essential cookies (always true if accepted)
  analytics     BOOLEAN NOT NULL DEFAULT FALSE,
  marketing     BOOLEAN NOT NULL DEFAULT FALSE,
  preferences   BOOLEAN NOT NULL DEFAULT FALSE,
  ip_address    VARCHAR(45) NULL,                -- optional: for compliance/logs
  user_agent    VARCHAR(500) NULL,                -- optional: browser info
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for looking up consent by session (e.g. on each page load)
CREATE INDEX IF NOT EXISTS idx_cookie_consent_session_id ON cookie_consent(session_id);
CREATE INDEX IF NOT EXISTS idx_cookie_consent_user_id ON cookie_consent(user_id);
CREATE INDEX IF NOT EXISTS idx_cookie_consent_created_at ON cookie_consent(created_at);

-- Optional: trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_cookie_consent_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cookie_consent_updated_at ON cookie_consent;
CREATE TRIGGER trigger_cookie_consent_updated_at
  BEFORE UPDATE ON cookie_consent
  FOR EACH ROW
  EXECUTE PROCEDURE update_cookie_consent_updated_at();

-- ============================================================
-- MySQL version (if you use MySQL instead of PostgreSQL):
-- ============================================================
/*
CREATE TABLE IF NOT EXISTS cookie_consent (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  session_id    VARCHAR(255) NOT NULL,
  user_id       INT NULL,
  essential     TINYINT(1) NOT NULL DEFAULT 1,
  analytics     TINYINT(1) NOT NULL DEFAULT 0,
  marketing     TINYINT(1) NOT NULL DEFAULT 0,
  preferences   TINYINT(1) NOT NULL DEFAULT 0,
  ip_address    VARCHAR(45) NULL,
  user_agent    VARCHAR(500) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_session_id (session_id),
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
);
*/
