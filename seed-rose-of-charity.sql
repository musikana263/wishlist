-- Rose of Charity wish list. Preliminary targets; donors can give more. Target 0 = no target.
-- Run once in the Neon SQL Editor after the app has started at least once.
-- Change any name, unit or goal here first, or edit them later on the /admin page.
DELETE FROM items;  -- clears the list (and any pledges on it) so you start fresh
-- measure: 'kg' or 'L' = target is a weight/volume; size = how much one unit holds. 'pack' / 'unit' = counts.
-- 'choice' = donors just select it, no amount. Target 0 = no target.
INSERT INTO items (name, unit, measure, size, qty, sort) VALUES
  ('Mealie meal (upfu)',                '5kg bag',    'kg', 5,   200,  1),
  ('Rice',                              '2kg pack',   'kg', 2,   100,  2),
  ('Sugar',                             '2kg pack',   'kg', 2,    30,  3),
  ('Cooking oil',                       '2L bottle',  'L',  2,    30,  4),
  ('Meat',                              'any',   'choice', 1,     0,  5),
  ('Beans',                             '2kg pack',   'kg', 2,    30,  6),
  ('Soya chunks',                       '500g pack',  'kg', 0.5,  15,  7),
  ('Sanitary pads',                     'pack',       'pack', 1,    40,  8),
  ('Bathing soap',                      'bar',        'unit', 1,    60,  9),
  ('Vaseline (petroleum jelly)',        'tub',        'unit', 1,    30, 10),
  ('Surf washing powder',               '2kg pack',   'kg', 2,    30, 11),
  ('Clothes (ages 0 to 18)',            'any',       'choice',   1,     0, 12),
  ('Stationery (books, pens, pencils)', 'any',       'choice',   1,     0, 15),
  ('Toys',                              'any',        'choice',   1,     0, 16);
UPDATE settings SET
  visit_date = 'Saturday 14 November 2026',
  deadline   = 'Friday 13 November 2026',
  end_date   = '2026-11-14',
  whatsapp   = '0787749494',
  intro      = 'On Saturday 14 November, Musikana Foundation is visiting the children at Rose of Charity Children''s Home in Chinotimba, Victoria Falls. We have given ourselves exactly one month to see what our community can achieve together. We have set preliminary targets below, but every item, big or small, makes a difference. Choose what you''d like to give and drop it off before the visit.'
WHERE id = 1;
