-- 0026 — owner_alert push category
--
-- alertOwner() used to be SMS-only: every escalation, digest and Square warning
-- went to Sebastian's phone as a text from the business line. Now that the
-- business number is the A2P-registered sender, that traffic (links + urgency
-- wording, several per hour, to one recipient) is the pattern most likely to
-- get the number flagged as spam by handsets and carriers. Owner alerts move to
-- push; SMS remains only as the fallback when no owner device is registered.
--
-- The category check on push_notification_events is the one place the event
-- vocabulary is enforced in the database, so it has to learn the new value.

begin;

alter table public.push_notification_events
  drop constraint if exists push_notification_events_category_check;
alter table public.push_notification_events
  add constraint push_notification_events_category_check check (category in (
    'new_lead', 'customer_message', 'lead_uncontacted',
    'estimate_approved', 'deposit_received', 'invoice_paid',
    'payment_issue', 'job_changed', 'checklist_blocked',
    'crew_late', 'morning_summary', 'daily_followups',
    'owner_alert'
  ));

notify pgrst, 'reload schema';
commit;
