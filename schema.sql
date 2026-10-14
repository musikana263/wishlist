-- Runs automatically when the server starts. Safe to run more than once.
CREATE TABLE IF NOT EXISTS settings (
  id          INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  home        TEXT NOT NULL DEFAULT 'Rose of Charity Children''s Home',
  intro       TEXT NOT NULL DEFAULT 'Musikana Foundation is visiting the children at Rose of Charity in Chinotimba, Victoria Falls. Choose an item below, pledge it, and drop it off before the deadline. Everything goes straight to the home.',
  visit_date  TEXT NOT NULL DEFAULT 'Date to be confirmed',
  dropoff     TEXT NOT NULL DEFAULT 'To be confirmed',
  deadline    TEXT NOT NULL DEFAULT 'To be confirmed',
  whatsapp    TEXT NOT NULL DEFAULT '',
  cash        TEXT NOT NULL DEFAULT 'Cash donation details to be confirmed.'
);
INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS items (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  unit        TEXT NOT NULL DEFAULT 'each',
  qty         INT  NOT NULL CHECK (qty >= 0),
  received    INT  NOT NULL DEFAULT 0 CHECK (received >= 0),
  sort        INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pledges (
  id          SERIAL PRIMARY KEY,
  item_id     INT  NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  donor_name  TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  qty         INT  NOT NULL CHECK (qty > 0),
  show_name   BOOLEAN NOT NULL DEFAULT TRUE,
  status      TEXT NOT NULL DEFAULT 'pledged' CHECK (status IN ('pledged','received','cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pledges_item_idx ON pledges(item_id);
-- Added: email and a shared reference for pledges made together
ALTER TABLE pledges ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE pledges ADD COLUMN IF NOT EXISTS ref   TEXT NOT NULL DEFAULT '';
-- Added: campaign end date (YYYY-MM-DD) for the countdown
ALTER TABLE settings ADD COLUMN IF NOT EXISTS end_date TEXT NOT NULL DEFAULT '';
-- Added: weight/volume targets. size = how much one unit holds (e.g. 2 for a 2kg pack),
-- measure = 'kg', 'L', 'pack', 'unit' (counts; '' is treated as 'unit') or 'choice' (select only, no quantity). With a measure, items.qty and items.received are in kg/L.
ALTER TABLE items ADD COLUMN IF NOT EXISTS size    NUMERIC NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN IF NOT EXISTS measure TEXT    NOT NULL DEFAULT '';
