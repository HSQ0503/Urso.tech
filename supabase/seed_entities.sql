-- TEMPORARY sample data for the entity tables (groomers, customers,
-- store_listings, agent_actions). Ported from the hand-tuned mock in data.ts so
-- the numbers stay realistic and consistent with metrics_daily + the store tiers.
-- These are NOT real Woof Gang records. Delete when the real feeds are wired.
-- Re-runnable (on conflict do nothing / not-exists guards).

-- ── Groomers (Team page + manager "Your team") ─────────────────────────────
insert into groomers (id, client_id, store_id, name, flag, rev_per_hr, appts, rebook, attach, util, avg_ticket)
select g.id, c.id, g.store_id, g.name, g.flag, g.rev_per_hr, g.appts, g.rebook, g.attach, g.util, g.avg_ticket
from clients c
cross join (values
  ('maria', 'wp', 'Maria Reyes', 'star',  118, 96, 0.68, 0.41, 0.88, 102),
  ('james', 'wg', 'James Cole',   null,    104, 88, 0.61, 0.34, 0.82, 94),
  ('sofia', 'wp', 'Sofia Nunes',  null,    99,  84, 0.59, 0.36, 0.79, 91),
  ('priya', 'wg', 'Priya Shah',   null,    92,  79, 0.54, 0.30, 0.76, 87),
  ('dana',  'wm', 'Dana Brooks', 'coach',  88,  81, 0.43, 0.19, 0.71, 80),
  ('tyler', 'lv', 'Tyler Wood',  'coach',  84,  74, 0.38, 0.22, 0.69, 78)
) as g(id, store_id, name, flag, rev_per_hr, appts, rebook, attach, util, avg_ticket)
where c.slug = 'woof-gang'
on conflict (id) do nothing;

-- ── Store listings: reputation + findability (Reviews cards, ratings) ───────
insert into store_listings (store_id, client_id, local_rank, listing_completeness, has_book_button, avg_rating, review_count, response_rate, response_hours)
select g.store_id, c.id, g.rank, g.listing, g.book, g.rating, g.vol, g.resp, g.hrs
from clients c
cross join (values
  ('wp', 2, 0.86, false, 4.6, 232, 0.81, 9),
  ('wg', 3, 0.95, true,  4.5, 199, 0.74, 14),
  ('lv', 5, 0.78, true,  4.4, 121, 0.52, 26),
  ('wm', 6, 0.74, true,  4.4, 118, 0.48, 31)
) as g(store_id, rank, listing, book, rating, vol, resp, hrs)
where c.slug = 'woof-gang'
on conflict (store_id) do nothing;

-- ── Customers: the recognizable named ones (top of the value table) ────────
insert into customers (id, client_id, store_id, name, pet, visits, ltv, last_visit_at, segment)
select g.id, c.id, g.store_id, g.name, g.pet, g.visits, g.ltv, current_date - g.last_days, g.segment
from clients c
cross join (values
  ('cust-daisy',  'wp', 'Daisy Whitfield', 'Poodle',         24, 2880, 12,  'VIP'),
  ('cust-marcus', 'wg', 'Marcus Lee',      'Goldendoodle',   19, 2140, 9,   'VIP'),
  ('cust-grace',  'wp', 'Grace Nolan',     'Cocker Spaniel', 21, 2460, 16,  'VIP'),
  ('cust-elena',  'wp', 'Elena Ortiz',     'Schnauzer',      16, 1760, 27,  'Loyal'),
  ('cust-owen',   'wg', 'Owen Hartley',    'Border Collie',  13, 1410, 34,  'Loyal'),
  ('cust-priya',  'lv', 'Priya Raman',     'Cavapoo',        14, 1520, 58,  'At risk'),
  ('cust-tom',    'wm', 'Tom Becker',      'Labrador',       11, 1180, 71,  'At risk'),
  ('cust-sara',   'wg', 'Sara Klein',      'Bichon',         9,  980,  96,  'Lapsed'),
  ('cust-devon',  'lv', 'Devon Pryce',     'Shih Tzu',       8,  860,  104, 'Lapsed')
) as g(id, store_id, name, pet, visits, ltv, last_days, segment)
where c.slug = 'woof-gang'
on conflict (id) do nothing;

-- ── Customers: a realistic generated base so segment counts + win-back lists
--    have depth (24 more, spread across stores / recency / value) ──────────
insert into customers (id, client_id, store_id, name, pet, visits, ltv, first_visit_at, last_visit_at, segment)
select
  'gen-' || g.n,
  c.id,
  (array['wp','wg','lv','wm'])[1 + (g.n % 4)],
  (array['Avery Stone','Jordan Webb','Casey Lin','Riley Park','Morgan Hale','Quinn Diaz','Reese Vogel','Parker Shaw',
         'Drew Mercer','Sage Holt','Blair Tan','Emery Cole','Finn Ross','Harper Dale','Iris Kwon','Jonah Reed',
         'Kira Volk','Liam Frost','Maya Singh','Noah Pratt','Olive Yang','Reed Carter','Tess Lowe','Wade Burns'])[g.n],
  (array['Labrador','Poodle','Beagle','Cavapoo','Schnauzer','Goldendoodle','Shih Tzu','Bichon','Cocker Spaniel','Border Collie'])[1 + (g.n % 10)],
  v.visits,
  v.ltv,
  current_date - (v.visits * 28 + l.last_days),
  current_date - l.last_days,
  case
    when l.last_days > 90 then 'Lapsed'
    when l.last_days > 60 then 'At risk'
    when v.ltv > 2000 then 'VIP'
    else 'Loyal'
  end
from clients c
cross join generate_series(1, 24) as g(n)
cross join lateral (select (3 + floor(random() * 20))::int as visits) v0
cross join lateral (select v0.visits as visits, round((v0.visits * (70 + random() * 70)))::int as ltv) v
cross join lateral (select (8 + floor(random() * 120))::int as last_days) l
where c.slug = 'woof-gang'
on conflict (id) do nothing;

-- ── Agent actions (AI action center + manager queue) ───────────────────────
-- store_id = the single store it targets (null = all/multi); store_label is the
-- display string; plan_key links to the action-plan content in data.ts.
alter table agent_actions add column if not exists store_label text;
alter table agent_actions add column if not exists plan_key text;

insert into agent_actions (client_id, store_id, store_label, agent, title, detail, metric, status, result, pending, plan_key)
select c.id, a.store_id, a.store_label, a.agent, a.title, a.detail, a.metric, a.status, a.result, a.pending, a.plan_key
from clients c
cross join (values
  ('wm'::text, 'Windermere', 'Call capture', 'Text back missed after-hours calls',
   'Send an instant message to callers who reached voicemail after closing, inviting them to book online or request a callback the next morning.',
   '14 missed after-hours calls', 'suggested', null::text, true, 'call-capture'),
  ('lv', 'Lakeside Village', 'Reputation', 'Reply to unanswered reviews',
   'Draft on-brand responses to the seven reviews left without a reply, prioritising the two rated below three stars.',
   '7 reviews unanswered', 'suggested', null, false, 'reviews'),
  (null, 'Lakeside · Windermere', 'Team', 'Coach the two lowest-rebooking groomers',
   'Create a coaching task for each store manager covering the rebooking conversation at checkout, with this period''s figures attached.',
   'Rebook 38–43%', 'approved', null, false, 'rebook-coach'),
  (null, 'All stores', 'Reputation', 'Request reviews from recent grooming customers',
   'Send a review request a day after each completed groom to clients who rated their visit four or five stars.',
   '38 eligible this period', 'running', null, false, 'request-reviews'),
  (null, 'All stores', 'Retention', 'Win back single-visit customers',
   'Message customers who came once and did not return within 60 days with a personalised rebooking link.',
   '88 single-visit customers', 'running', null, false, 'winback'),
  ('lv', 'Lakeside Village', 'Reputation', 'Flag suspected fake reviews to Google',
   'Cross-reference one-star reviewers against FranPOS records and submit a removal case for those with no matching customer on file.',
   '4 with no customer on file', 'completed', '4 cases submitted to Google', false, 'fake-reviews'),
  ('wp', 'Winter Park', 'Retention', 'Reactivate lapsed grooming customers',
   'A staged win-back sequence to customers inactive for 60–90 days who previously visited at least three times.',
   '31 contacted', 'completed', '31 messaged · 18 replied · 11 rebooked', false, 'winback'),
  ('wp', 'Winter Park', 'Visibility', 'Add the missing booking link on Google',
   'Prepare the Google Business Profile update that adds an online booking button to the highest-ranked listing.',
   'Ranks #2, no book link', 'completed', 'Update prepared — awaiting owner publish', false, 'booking-link')
) as a(store_id, store_label, agent, title, detail, metric, status, result, pending, plan_key)
where c.slug = 'woof-gang'
  and not exists (select 1 from agent_actions limit 1);
