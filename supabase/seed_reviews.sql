-- TEMPORARY sample reviews (Reviews page). Ported from the per-store pools in
-- data.ts so each location reads in character: Winter Park's missing book link,
-- the newer stores' after-hours misses, and one suspected-fake 1-star each
-- (flagged_fake = true, has_matching_customer = false → the FranPOS cross-ref).
-- Delete when the Google Business Profile feed is wired.

insert into reviews (id, client_id, store_id, author, rating, body, created_at, flagged_fake, has_matching_customer)
select r.id, c.id, r.store_id, r.author, r.rating, r.body, now() - (r.days || ' days')::interval, r.flagged, not r.flagged
from clients c
cross join (values
  -- Winter Park (4.6)
  ('rev-wp-1', 'wp', 'Morgan D.', 5, 'Bella came back so soft and happy. Maria clearly cares.', 6, false),
  ('rev-wp-2', 'wp', 'Sam P.',    5, 'Been coming for two years — the most consistent groom in Winter Park.', 13, false),
  ('rev-wp-3', 'wp', 'Casey R.',  5, 'They remember our dog by name every single time.', 21, false),
  ('rev-wp-4', 'wp', 'Avery T.',  4, 'Friendly front desk and the nail trim was painless for once.', 30, false),
  ('rev-wp-5', 'wp', 'Quinn L.',  2, 'Tried to book online but there''s no link on their Google page — had to call.', 9, false),
  ('rev-wp-6', 'wp', 'Elena O.',  2, 'Called twice during the day and no one picked up.', 17, false),
  ('rev-wp-7', 'wp', 'Grace N.',  1, 'Never been here. Not sure why this is on my account.', 25, true),
  -- Winter Garden (4.5)
  ('rev-wg-1', 'wg', 'Jordan M.', 5, 'Great with our anxious rescue — took their time and it shows.', 5, false),
  ('rev-wg-2', 'wg', 'Reese H.',  5, 'James did a fantastic teddy-bear cut. Booked the next one on the spot.', 12, false),
  ('rev-wg-3', 'wg', 'Drew B.',   4, 'Consistent results every visit. Highly recommend.', 19, false),
  ('rev-wg-4', 'wg', 'Parker S.', 4, 'Easy to reschedule and always on time.', 28, false),
  ('rev-wg-5', 'wg', 'Owen H.',   2, 'Waited 20 minutes past my appointment time.', 8, false),
  ('rev-wg-6', 'wg', 'Marcus L.', 3, 'Cut wasn''t quite what I asked for this time.', 16, false),
  ('rev-wg-7', 'wg', 'Sara K.',   1, 'Worst place ever, never going back — no appointment on record.', 22, true),
  -- Lakeside Village (4.4)
  ('rev-lv-1', 'lv', 'Devon P.',  5, 'New to the area and so glad we found them — lovely with our cavapoo.', 4, false),
  ('rev-lv-2', 'lv', 'Riley K.',  4, 'Nice improvement since they opened — the groomers are getting dialed in.', 11, false),
  ('rev-lv-3', 'lv', 'Casey R.',  4, 'Clean shop, friendly staff, fair price.', 20, false),
  ('rev-lv-4', 'lv', 'Jordan M.', 3, 'Quality is hit or miss depending on who you get.', 7, false),
  ('rev-lv-5', 'lv', 'Avery T.',  2, 'Left a voicemail and never heard back.', 15, false),
  ('rev-lv-6', 'lv', 'Sam P.',    2, 'Showed up for my slot and they had no record of it.', 24, false),
  ('rev-lv-7', 'lv', 'Quinn L.',  1, 'One star — reviewer has no record of ever visiting.', 30, true),
  -- Windermere (4.4)
  ('rev-wm-1', 'wm', 'Tom B.',    5, 'Newer location but already our go-to. Sweet with our lab.', 3, false),
  ('rev-wm-2', 'wm', 'Riley K.',  5, 'Booked easily and the groomer listened to exactly what we wanted.', 10, false),
  ('rev-wm-3', 'wm', 'Avery T.',  4, 'In and out, great cut, will be back.', 18, false),
  ('rev-wm-4', 'wm', 'Casey R.',  2, 'Called after work to book and it went to voicemail — no callback.', 6, false),
  ('rev-wm-5', 'wm', 'Jordan M.', 2, 'Tried three times after 6pm and never got through.', 14, false),
  ('rev-wm-6', 'wm', 'Parker S.', 3, 'Rebooking was awkward, had to chase them.', 23, false),
  ('rev-wm-7', 'wm', 'Drew B.',   1, 'Terrible, do not recommend — no matching customer on file.', 29, true)
) as r(id, store_id, author, rating, body, days, flagged)
where c.slug = 'woof-gang'
on conflict (id) do nothing;
