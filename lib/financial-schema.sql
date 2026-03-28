-- Financial Module Database Schema
-- Command Center — Personal Dashboard
-- Created: 2026-03-09

-- Subscriptions registry
CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  provider TEXT,
  category TEXT,                         -- AI/ML, Cloud, Media, Mobile, Finance, Education, etc
  amount REAL,                           -- Monthly cost (normalized to monthly)
  currency TEXT DEFAULT 'USD',
  billing_cycle TEXT,                    -- monthly, annual, quarterly
  next_payment_date TEXT,                -- ISO date YYYY-MM-DD
  autopay_enabled BOOLEAN DEFAULT 1,
  payment_method TEXT,                   -- Chase Visa, Apple Card, etc
  status TEXT DEFAULT 'active',          -- active, cancelled, trial, paused
  usage_level TEXT,                      -- high, medium, low, zero
  essential BOOLEAN DEFAULT 0,           -- Is this critical?
  notes TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Payment history tracking
CREATE TABLE payment_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER,
  amount REAL,
  currency TEXT,
  payment_date TEXT,                     -- ISO date
  payment_method TEXT,
  status TEXT DEFAULT 'success',         -- success, failed, pending
  email_id TEXT,                         -- Link to Gmail message if available
  notes TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

-- Alternative services (for cost comparison)
CREATE TABLE cost_alternatives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER,
  alternative_name TEXT NOT NULL,
  alternative_provider TEXT,
  alternative_cost REAL,
  alternative_billing_cycle TEXT,        -- monthly, annual
  pros TEXT,                             -- JSON array or newline-separated
  cons TEXT,                             -- JSON array or newline-separated
  migration_effort TEXT,                 -- easy, medium, hard
  annual_savings REAL,                   -- Calculated field
  notes TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_category ON subscriptions(category);
CREATE INDEX idx_subscriptions_next_payment ON subscriptions(next_payment_date);
CREATE INDEX idx_subscriptions_usage ON subscriptions(usage_level);
CREATE INDEX idx_payment_history_date ON payment_history(payment_date DESC);
CREATE INDEX idx_payment_history_sub ON payment_history(subscription_id);

-- Triggers to update updated_at timestamp
CREATE TRIGGER subscriptions_update_timestamp 
AFTER UPDATE ON subscriptions
BEGIN
  UPDATE subscriptions SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

-- View: Monthly spend summary
CREATE VIEW v_monthly_spend AS
SELECT 
  category,
  COUNT(*) as subscription_count,
  SUM(CASE 
    WHEN billing_cycle = 'monthly' THEN amount
    WHEN billing_cycle = 'annual' THEN amount / 12.0
    WHEN billing_cycle = 'quarterly' THEN amount / 3.0
    ELSE amount
  END) as monthly_cost,
  SUM(CASE 
    WHEN billing_cycle = 'annual' THEN amount
    WHEN billing_cycle = 'monthly' THEN amount * 12
    WHEN billing_cycle = 'quarterly' THEN amount * 4
    ELSE amount * 12
  END) as annual_cost
FROM subscriptions
WHERE status = 'active'
GROUP BY category;

-- View: Upcoming renewals (next 30 days)
CREATE VIEW v_upcoming_renewals AS
SELECT 
  id,
  name,
  provider,
  amount,
  currency,
  billing_cycle,
  next_payment_date,
  payment_method,
  autopay_enabled,
  julianday(next_payment_date) - julianday('now') as days_until
FROM subscriptions
WHERE status = 'active'
  AND next_payment_date IS NOT NULL
  AND julianday(next_payment_date) - julianday('now') BETWEEN 0 AND 30
ORDER BY next_payment_date ASC;

-- View: Potential waste (zero usage or duplicates)
CREATE VIEW v_potential_waste AS
SELECT 
  id,
  name,
  provider,
  category,
  amount,
  billing_cycle,
  usage_level,
  essential,
  CASE 
    WHEN billing_cycle = 'monthly' THEN amount * 12
    WHEN billing_cycle = 'annual' THEN amount
    WHEN billing_cycle = 'quarterly' THEN amount * 4
    ELSE amount * 12
  END as annual_cost,
  CASE
    WHEN usage_level = 'zero' THEN 'Zero usage'
    WHEN NOT essential AND usage_level = 'low' THEN 'Low usage, non-essential'
    ELSE 'Review alternatives'
  END as reason
FROM subscriptions
WHERE status = 'active'
  AND (usage_level IN ('zero', 'low') OR NOT essential)
ORDER BY annual_cost DESC;
