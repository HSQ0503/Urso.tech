-- Canes Pressure Washing — optional service catalog seed. Run in the CANES
-- project (jeznnlveaymtrhisqckq). Idempotent: inserts the standard services
-- ONLY IF the catalog is currently empty, so re-running (or running after
-- Sebastian has added his own list) is a no-op. Money in integer cents.
--
-- Prices below are PLACEHOLDERS — edit them on the Items page
-- (/CanesPressure/estimates/items) to match Sebastian's real pricing.

insert into service_catalog (name, kind, default_price_cents)
select v.name, v.kind, v.price
from (values
  ('Driveway wash', 'service', 15000),
  ('House wash (soft wash)', 'service', 30000),
  ('Roof wash (tile)', 'service', 45000),
  ('Pool deck / paver clean', 'service', 20000),
  ('Paver sealing', 'service', 60000),
  ('Gutter brightening', 'service', 12000)
) as v(name, kind, price)
where not exists (select 1 from service_catalog);
