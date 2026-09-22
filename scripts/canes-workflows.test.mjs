import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function source(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(
    fs.readFileSync(path.join(root, file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  new Function("require", "exports", code)((name) => {
    if (name in mocks) return mocks[name];
    if (name === "@urso/types")
      return {
        ...source("packages/types/src/types.ts"),
        ...source("packages/types/src/pricing.ts"),
      };
    if (name.startsWith("."))
      return source(
        path.relative(
          root,
          path.resolve(root, path.dirname(file), name + ".ts"),
        ),
      );
    throw new Error("Unexpected dependency: " + name);
  }, exports);
  return exports;
}

test("line discounts apply to quantity before tax and reject over-discounting", () => {
  const { priceServices, priceServiceLine } = source(
    "packages/types/src/pricing.ts",
  );
  const priced = priceServices(
    [
      {
        name: "Wash",
        quantity: 2,
        unitPriceCents: 10000,
        discountMode: "percent",
        discountValue: 1000,
        taxable: true,
      },
    ],
    0,
    700,
  );
  assert.equal(priced.discountCents, 2000);
  assert.equal(priced.subtotalCents, 18000);
  assert.equal(priced.taxCents, 1260);
  assert.equal(priced.totalCents, 19260);
  assert.throws(() =>
    priceServiceLine({
      name: "Wash",
      quantity: 1,
      unitPriceCents: 100,
      discountValue: 101,
    }),
  );
});

test("monthly repeats retain the original 31st through short months", () => {
  const { anchoredMonthDate } = source("packages/types/src/pricing.ts");
  const february = anchoredMonthDate("2027-01-31", 1, 31);
  assert.equal(february, "2027-02-28");
  assert.equal(anchoredMonthDate(february, 1, 31), "2027-03-31");
  assert.equal(anchoredMonthDate("2028-01-31", 1, 31), "2028-02-29");
});

test("customer messages identify Canes and reminders have no confirmation demand", () => {
  const { estimateText, jobReminderText } = source(
    "lib/canes/customer-messages.ts",
  );
  assert.match(
    estimateText("Han Test", "https://example.com/quote"),
    /^Hey Han, this is Canes Pressure Washing!/,
  );
  const text = jobReminderText(
    "Han",
    "2026-10-01T12:00:00Z",
    "https://example.com/job",
  );
  assert.match(text, /8:00 AM Eastern/);
  assert.match(text, /561-537-5674/);
  assert.match(text, /https:\/\/example.com\/job/);
  assert.doesNotMatch(text, /YES|confirm/i);
});

test("ET wall-clock conversion round-trips through isoToEtLocal", () => {
  const { etLocalToIso, isoToEtLocal } = source("packages/types/src/types.ts");
  const iso = etLocalToIso("2026-09-20T09:00");
  assert.equal(isoToEtLocal(iso), "2026-09-20T09:00");
});

test("uncontacted Meta leads are new meta_ads rows only", () => {
  const { isUncontactedMetaLead } = source("packages/types/src/types.ts");
  assert.equal(isUncontactedMetaLead({ source: "meta_ads", status: "new" }), true);
  assert.equal(isUncontactedMetaLead({ source: "meta_ads", status: "contacted" }), false);
  assert.equal(isUncontactedMetaLead({ source: "website", status: "new" }), false);
});

test("Instant Form field_data maps name, phone, extras in notes", () => {
  const { parseInstantFormFields, leadgenIdsFromPayload, verifyMetaSignature } = source(
    "lib/canes/meta-form.ts",
    { "node:crypto": { createHmac, timingSafeEqual } },
  );
  const fields = parseInstantFormFields([
    { name: "full_name", values: ["Jamie Rivera"] },
    { name: "phone_number", values: ["(561) 555-0199"] },
    { name: "email", values: ["jamie@example.com"] },
    { name: "which_surface", values: ["driveway"] },
  ]);
  assert.equal(fields.name, "Jamie Rivera");
  assert.equal(fields.phone, "+15615550199");
  assert.equal(fields.email, "jamie@example.com");
  assert.match(fields.notes, /which surface: driveway/);
  assert.deepEqual(
    leadgenIdsFromPayload({
      object: "page",
      entry: [{ changes: [{ field: "leadgen", value: { leadgen_id: "abc" } }] }],
    }),
    ["abc"],
  );
  const body = '{"object":"page"}';
  const header = `sha256=${createHmac("sha256", "secret").update(body, "utf8").digest("hex")}`;
  assert.equal(verifyMetaSignature(header, body, "secret"), true);
  assert.equal(verifyMetaSignature(header, body, "other"), false);
  assert.equal(verifyMetaSignature(null, body, "secret"), false);
});

test("Canes migrations and transactional workflows in isolated PostgreSQL", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
      create schema auth; create table auth.users(id uuid primary key,email text);
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    for (const file of fs
      .readdirSync(path.join(root, "supabase/canes"))
      .filter((file) => file.endsWith(".sql"))
      .sort()) {
      await db.exec(
        fs.readFileSync(path.join(root, "supabase/canes", file), "utf8"),
      );
    }
    await t.test(
      "accepted estimate snapshot survives later document changes",
      async () => {
        const {
          rows: [e],
        } = await db.query(
          `insert into estimates(number,status,customer_name,total_cents,terms,public_token) values('TEST-SIGN','sent','Original',10000,'Original terms','test-sign') returning id`,
        );
        await db.query(
          `insert into estimate_items(estimate_id,name,unit_price_cents,line_total_cents) values($1,'Wash',10000,10000)`,
          [e.id],
        );
        await db.query(
          `update estimates set status='approved',signature_name='Original',approved_at=now() where id=$1`,
          [e.id],
        );
        await db.query(
          `update estimates set terms='Changed',customer_name='Changed' where id=$1`,
          [e.id],
        );
        const {
          rows: [r],
        } = await db.query(
          `select snapshot from document_revisions where document_id=$1`,
          [e.id],
        );
        assert.equal(r.snapshot.terms, "Original terms");
        assert.equal(r.snapshot.customer_name, "Original");
        assert.equal(r.snapshot.items.length, 1);
      },
    );
    await t.test(
      "scheduled visit is created immediately once with all services",
      async () => {
        const {
          rows: [p],
        } = await db.query(
          `insert into recurring_plans(number,customer_name,cadence,price_per_visit_cents,status,starts_on,next_due_on,anchor_day,repeat_time,scheduling_enabled,agreement_required,public_token) values('TEST-REPEAT','Test','monthly',10000,'active','2040-01-31','2040-01-31',31,'08:00',true,false,'test-repeat') returning id`,
        );
        await db.query(
          `insert into recurring_plan_items(plan_id,position,name,quantity,unit_price_cents,line_total_cents) values($1,0,'Wash',1,10000,10000)`,
          [p.id],
        );
        const first = await db.query(
          `select * from mint_scheduled_plan_visit($1)`,
          [p.id],
        );
        assert.equal(first.rows[0].outcome, "scheduled");
        const second = await db.query(
          `select * from mint_scheduled_plan_visit($1)`,
          [p.id],
        );
        assert.equal(second.rows[0].outcome, "upcoming_exists");
        const {
          rows: [job],
        } = await db.query(
          `select id,status,to_char(scheduled_at at time zone 'America/New_York','HH24:MI') as time from jobs where plan_id=$1`,
          [p.id],
        );
        assert.equal(job.status, "scheduled");
        assert.equal(job.time, "08:00");
        assert.equal(
          (
            await db.query(
              `select count(*)::int as n from job_items where job_id=$1`,
              [job.id],
            )
          ).rows[0].n,
          1,
        );
        assert.equal(
          (
            await db.query(
              `select count(*)::int as n from tasks where payload->>'job_id'=$1`,
              [job.id],
            )
          ).rows[0].n,
          1,
        );
        const {
          rows: [clock],
        } = await db.query(
          `select next_due_on::text as next from recurring_plans where id=$1`,
          [p.id],
        );
        assert.equal(clock.next, "2040-02-29");
      },
    );
    await t.test(
      "create repeat plan is atomic, idempotent, and preserves discounts",
      async () => {
        const input = {
          customer_name: "Atomic repeat",
          cadence: "monthly",
          starts_on: "2041-01-31",
          repeat_time: "08:00",
          price_per_visit_cents: 18000,
          public_token: "atomic-repeat",
          request_key: "atomic-repeat-key",
          items: [
            {
              position: 0,
              name: "Wash",
              quantity: 2,
              unit_price_cents: 10000,
              line_total_cents: 18000,
              discount_mode: "percent",
              discount_value: 1000,
              discount_cents: 2000,
              taxable: false,
            },
          ],
        };
        const {
          rows: [created],
        } = await db.query(
          `select create_canes_repeat_plan($1::jsonb) as result`,
          [JSON.stringify(input)],
        );
        const id = created.result.planId;
        assert.ok(id);
        const {
          rows: [retry],
        } = await db.query(
          `select create_canes_repeat_plan($1::jsonb) as result`,
          [JSON.stringify(input)],
        );
        assert.equal(retry.result.planId, id);
        assert.equal(retry.result.duplicate, true);
        const {
          rows: [job],
        } = await db.query(`select id from jobs where plan_id=$1`, [id]);
        assert.equal(
          (
            await db.query(
              `select discount_cents from job_items where job_id=$1`,
              [job.id],
            )
          ).rows[0].discount_cents,
          2000,
        );
        await assert.rejects(
          db.query(`select create_canes_repeat_plan($1::jsonb)`, [
            JSON.stringify({
              ...input,
              public_token: "bad-repeat",
              request_key: "bad-repeat-key",
              items: [{ ...input.items[0], name: null }],
            }),
          ]),
        );
        assert.equal(
          (
            await db.query(
              `select count(*)::int as n from recurring_plans where request_key='bad-repeat-key'`,
            )
          ).rows[0].n,
          0,
        );
        assert.equal(
          (
            await db.query(
              `select configure_canes_repeat($1,'2041-02-28','09:00','monthly',90,null) as result`,
              [id],
            )
          ).rows[0].result,
          "saved",
        );
        // A time-only edit on the clamped next date must retain the existing anchor.
        await db.query(`update recurring_plans set anchor_day=31 where id=$1`, [
          id,
        ]);
        assert.equal(
          (
            await db.query(
              `select configure_canes_repeat($1,'2041-02-28','10:00','monthly',90,null) as result`,
              [id],
            )
          ).rows[0].result,
          "saved",
        );
        const {
          rows: [plan],
        } = await db.query(
          `select anchor_day,next_due_on::text from recurring_plans where id=$1`,
          [id],
        );
        assert.equal(plan.anchor_day, 31);
        assert.equal(plan.next_due_on, "2041-03-31");
        assert.equal(
          (
            await db.query(
              `select to_char(scheduled_at at time zone 'America/New_York','HH24:MI') as time from jobs where id=$1`,
              [job.id],
            )
          ).rows[0].time,
          "10:00",
        );
      },
    );
    await t.test(
      "options revisions preserve excluded items and invoice conversion carries deposits once",
      async () => {
        const {
          rows: [e],
        } = await db.query(
          `insert into estimates(number,status,estimate_type,total_cents,public_token) values('TEST-OPTIONS','draft','options',10000,'test-options') returning id`,
        );
        const {
          rows: [g],
        } = await db.query(
          `select canes_document_graph('estimate',$1) as graph`,
          [e.id],
        );
        const lines = [
          {
            name: "Included",
            quantity: 2,
            unit_price_cents: 10000,
            discount_mode: "percent",
            discount_value: 1000,
            discount_cents: 2000,
            taxable: true,
            line_total_cents: 18000,
            is_option: false,
          },
          {
            name: "Optional",
            quantity: 1,
            unit_price_cents: 5000,
            discount_mode: "amount",
            discount_value: 0,
            discount_cents: 0,
            taxable: false,
            line_total_cents: 5000,
            is_option: true,
            is_selected: false,
            package_group: "Extra",
          },
        ];
        assert.equal(
          (
            await db.query(
              `select revise_canes_documents('estimate',$1,$2,$3::jsonb,'{"tax_rate_bps":700}'::jsonb,'owner','verbal',null) as result`,
              [e.id, g.graph.fingerprint, JSON.stringify(lines)],
            )
          ).rows[0].result.outcome,
          "saved",
        );
        const {
          rows: [quote],
        } = await db.query(
          `select estimate_type,total_cents,revision from estimates where id=$1`,
          [e.id],
        );
        assert.equal(quote.estimate_type, "options");
        assert.equal(quote.total_cents, 19260);
        assert.equal(
          (
            await db.query(
              `select is_selected,package_group from estimate_items where estimate_id=$1 and is_option`,
              [e.id],
            )
          ).rows[0].package_group,
          "Extra",
        );
        assert.equal(
          (
            await db.query(
              `select accept_canes_estimate($1,$2,'Old','customer','{}'::jsonb,null) as result`,
              [e.id, quote.revision - 1],
            )
          ).rows[0].result.outcome,
          "conflict",
        );
        const {
          rows: [job],
        } = await db.query(
          `insert into jobs(estimate_id,status,total_cents,tax_rate_bps,tax_cents) values($1,'completed',19260,700,1260) returning id`,
          [e.id],
        );
        await db.query(
          `insert into job_items(job_id,name,quantity,unit_price_cents,line_total_cents,discount_mode,discount_value,discount_cents,taxable) values($1,'Included',2,10000,18000,'percent',1000,2000,true)`,
          [job.id],
        );
        await db.query(
          `insert into payments(job_id,amount_cents,currency,method,source,status,kind) values($1,5000,'USD','cash','manual','completed','deposit')`,
          [job.id],
        );
        const {
          rows: [created],
        } = await db.query(
          `select * from initialize_invoice_from_job_unleased_locked($1,'test-options-invoice','',null,'[]'::jsonb)`,
          [job.id],
        );
        assert.equal(created.outcome, "ready");
        await db.query(
          `select * from initialize_invoice_from_job_unleased_locked($1,'ignored-token','',null,'[]'::jsonb)`,
          [job.id],
        );
        const {
          rows: [invoice],
        } = await db.query(
          `select total_cents,amount_paid_cents,tax_cents from invoices where id=$1`,
          [created.invoice_id],
        );
        assert.deepEqual(invoice, {
          total_cents: 19260,
          amount_paid_cents: 5000,
          tax_cents: 1260,
        });
        assert.equal(
          (
            await db.query(
              `select discount_cents from invoice_items where invoice_id=$1`,
              [created.invoice_id],
            )
          ).rows[0].discount_cents,
          2000,
        );
      },
    );
    await t.test(
      "expense generation creates one occurrence and pausing keeps history",
      async () => {
        const {
          rows: [rule],
        } = await db.query(
          `insert into expense_rules(name,category,amount_cents,frequency,starts_on,next_due_on,anchor_day,cutover_on) values('Subscription','Software',9900,'monthly',current_date,current_date,extract(day from current_date)::int,current_date) returning id`,
        );
        await db.query(`select generate_expense_occurrences()`);
        await db.query(`select generate_expense_occurrences()`);
        assert.equal(
          (
            await db.query(
              `select count(*)::int as n from business_expenses where rule_id=$1`,
              [rule.id],
            )
          ).rows[0].n,
          1,
        );
        await db.query(
          `update expense_rules set active=false,amount_cents=12000 where id=$1`,
          [rule.id],
        );
        assert.equal(
          (
            await db.query(
              `select amount_cents from business_expenses where rule_id=$1`,
              [rule.id],
            )
          ).rows[0].amount_cents,
          9900,
        );
      },
    );
    await t.test(
      "employee totals use recorded expenses, including historical payments",
      async () => {
        const {
          rows: [employee],
        } = await db.query(
          `insert into team_members(name,role,comp_type) values('Test employee','worker','none') returning id`,
        );
        await db.query(
          `insert into business_expenses(name,amount_cents,category,frequency,recurring,incurred_on,employee_id) values('Labor',12000,'Labor','one_time',false,current_date,$1),('Labor',5000,'Labor','one_time',false,'2000-01-01',$1)`,
          [employee.id],
        );
        const {
          rows: [totals],
        } = await db.query(
          `select * from canes_employee_payment_totals() where id=$1`,
          [employee.id],
        );
        assert.equal(Number(totals.month_cents), 12000);
        assert.equal(Number(totals.all_time_cents), 17000);
      },
    );
    await t.test(
      "linked revisions retain deposits, signatures, and transferable customer credit",
      async () => {
        const {
          rows: [contact],
        } = await db.query(
          `insert into contacts(name,source) values('Revision customer','other') returning id`,
        );
        const {
          rows: [estimate],
        } = await db.query(
          `insert into estimates(number,status,customer_name,contact_id,total_cents,terms,public_token) values('TEST-REV','sent','Revision customer',$1,100000,'Original agreement','test-rev') returning id`,
          [contact.id],
        );
        await db.query(
          `insert into estimate_items(estimate_id,name,unit_price_cents,line_total_cents) values($1,'Wash',100000,100000)`,
          [estimate.id],
        );
        await db.query(
          `select accept_canes_estimate($1,(select revision from estimates where id=$1),'Revision customer','customer','{"strokes":[[[0,0],[1,1],[2,2],[3,3],[4,4]]],"width":600,"height":180}'::jsonb,null)`,
          [estimate.id],
        );
        const {
          rows: [job],
        } = await db.query(
          `insert into jobs(estimate_id,contact_id,status,total_cents) values($1,$2,'completed',100000) returning id`,
          [estimate.id, contact.id],
        );
        await db.query(
          `insert into job_items(job_id,name,unit_price_cents,line_total_cents) values($1,'Wash',100000,100000)`,
          [job.id],
        );
        const {
          rows: [invoice],
        } = await db.query(
          `insert into invoices(number,status,contact_id,job_id,estimate_id,total_cents,public_token,initialization_completed_at) values('TEST-REV-INV','sent',$1,$2,$3,100000,'test-rev-inv',now()) returning id`,
          [contact.id, job.id, estimate.id],
        );
        await db.query(
          `insert into invoice_items(invoice_id,name,unit_price_cents,line_total_cents) values($1,'Wash',100000,100000)`,
          [invoice.id],
        );
        const {
          rows: [payment],
        } = await db.query(
          `insert into payments(invoice_id,job_id,amount_cents,currency,method,source,status,kind) values($1,$2,90000,'USD','cash','manual','completed','deposit') returning id`,
          [invoice.id, job.id],
        );
        await db.query(`select recompute_invoice_paid_locked($1)`, [
          invoice.id,
        ]);
        const {
          rows: [before],
        } = await db.query(
          `select canes_document_graph('estimate',$1) as graph`,
          [estimate.id],
        );
        const {
          rows: [lease],
        } = await db.query(`select gen_random_uuid() as id`);
        assert.equal(
          (
            await db.query(`select claim_canes_invoice_revision($1,$2) as ok`, [
              invoice.id,
              lease.id,
            ])
          ).rows[0].ok,
          true,
        );
        await db.query(
          `select claim_job_cancellation_billing_locked($1,(select status from jobs where id=$1),$2)`,
          [job.id, lease.id],
        );
        const lines = JSON.stringify([
          {
            name: "Wash",
            quantity: 1,
            unit_price_cents: 100000,
            discount_mode: "amount",
            discount_value: 20000,
            discount_cents: 20000,
            taxable: false,
            line_total_cents: 80000,
          },
        ]);
        const {
          rows: [saved],
        } = await db.query(
          `select revise_canes_documents('estimate',$1,$2,$3::jsonb,'{"adjustment_cents":0,"tax_rate_bps":0,"terms":"Revised agreement"}'::jsonb,'test-owner','verbal',$4) as result`,
          [estimate.id, before.graph.fingerprint, lines, lease.id],
        );
        assert.equal(saved.result.outcome, "saved");
        const {
          rows: [bill],
        } = await db.query(
          `select total_cents,amount_paid_cents,status from invoices where id=$1`,
          [invoice.id],
        );
        assert.deepEqual(bill, {
          total_cents: 80000,
          amount_paid_cents: 90000,
          status: "paid",
        });
        assert.equal(
          (await db.query(`select status from jobs where id=$1`, [job.id]))
            .rows[0].status,
          "paid",
        );
        const {
          rows: [snapshot],
        } = await db.query(
          `select snapshot from document_revisions where document_id=$1 and reason='accepted' order by revision limit 1`,
          [estimate.id],
        );
        assert.equal(snapshot.snapshot.total_cents, 100000);
        assert.equal(snapshot.snapshot.terms, "Original agreement");
        const stale = await db.query(
          `select revise_canes_documents('estimate',$1,$2,$3::jsonb,'{}'::jsonb,'test-owner','verbal',$4) as result`,
          [estimate.id, before.graph.fingerprint, lines, lease.id],
        );
        assert.equal(stale.rows[0].result.outcome, "conflict");
        const {
          rows: [target],
        } = await db.query(
          `insert into invoices(number,status,contact_id,total_cents,public_token,initialization_completed_at) values('TEST-CREDIT','sent',$1,50000,'test-credit',now()) returning id`,
          [contact.id],
        );
        await db.query(`select claim_invoice_billing_operation($1,$2)`, [
          target.id,
          lease.id,
        ]);
        assert.equal(
          (
            await db.query(
              `select apply_canes_customer_credit($1,$2,10000,'test-credit-key','owner',$3) as outcome`,
              [invoice.id, target.id, lease.id],
            )
          ).rows[0].outcome,
          "applied",
        );
        assert.equal(
          (
            await db.query(
              `select apply_canes_customer_credit($1,$2,10000,'test-credit-key','owner',$3) as outcome`,
              [invoice.id, target.id, lease.id],
            )
          ).rows[0].outcome,
          "duplicate",
        );
        assert.equal(
          (
            await db.query(
              `select amount_paid_cents from invoices where id=$1`,
              [target.id],
            )
          ).rows[0].amount_paid_cents,
          10000,
        );
        assert.equal(
          (
            await db.query(
              `select amount_paid_cents from invoices where id=$1`,
              [invoice.id],
            )
          ).rows[0].amount_paid_cents,
          80000,
        );
        assert.equal(
          (
            await db.query(
              `select sum(amount_cents)::int as cents from payments where invoice_id in($1,$2)`,
              [invoice.id, target.id],
            )
          ).rows[0].cents,
          90000,
        );
        await db.query(`select release_invoice_billing_operation($1,$2)`, [
          invoice.id,
          lease.id,
        ]);
        await db.query(`select release_job_deposit_link_operation($1,$2)`, [
          job.id,
          lease.id,
        ]);
        const refund = await db.query(
          `select record_canes_manual_refund($1,10000,'test-refund-key','owner') as outcome`,
          [payment.id],
        );
        assert.equal(refund.rows[0].outcome, "recorded");
        assert.equal(
          (
            await db.query(
              `select amount_paid_cents from invoices where id=$1`,
              [invoice.id],
            )
          ).rows[0].amount_paid_cents,
          80000,
        );
        assert.equal(
          (
            await db.query(
              `select amount_paid_cents from invoices where id=$1`,
              [target.id],
            )
          ).rows[0].amount_paid_cents,
          0,
        );
        assert.equal(
          (
            await db.query(
              `select reversed_cents from customer_credit_transfers where request_key='test-credit-key'`,
            )
          ).rows[0].reversed_cents,
          10000,
        );
      },
    );
    await t.test(
      "converting a booked job retains it as the first visit without duplication",
      async () => {
        const {
          rows: [job],
        } = await db.query(
          `insert into jobs(status,scheduled_at,duration_minutes) values('scheduled','2043-01-31T13:00:00Z',90) returning id`,
        );
        const input = {
          source_job_id: job.id,
          customer_name: "Conversion",
          cadence: "monthly",
          starts_on: "2043-02-10",
          repeat_time: "08:00",
          price_per_visit_cents: 10000,
          public_token: "converted-repeat",
          items: [
            {
              position: 0,
              name: "Wash",
              quantity: 1,
              unit_price_cents: 10000,
              line_total_cents: 10000,
            },
          ],
        };
        const {
          rows: [plan],
        } = await db.query(
          `select create_canes_repeat_plan($1::jsonb) as result`,
          [JSON.stringify(input)],
        );
        assert.equal(
          (await db.query(`select plan_id from jobs where id=$1`, [job.id]))
            .rows[0].plan_id,
          plan.result.planId,
        );
        assert.equal(
          (
            await db.query(
              `select count(*)::int as n from jobs where plan_id=$1`,
              [plan.result.planId],
            )
          ).rows[0].n,
          1,
        );
        const {
          rows: [settings],
        } = await db.query(
          `select starts_on::text,next_due_on::text,duration_minutes from recurring_plans where id=$1`,
          [plan.result.planId],
        );
        assert.deepEqual(settings, {
          starts_on: "2043-01-31",
          next_due_on: "2043-02-28",
          duration_minutes: 90,
        });
      },
    );
    await t.test(
      "revision defaults to one visit and explicitly propagates future prices",
      async () => {
        const input = {
          customer_name: "Future scope",
          cadence: "monthly",
          starts_on: "2042-01-31",
          repeat_time: "08:00",
          price_per_visit_cents: 10000,
          public_token: "scope-repeat",
          items: [
            {
              position: 0,
              name: "Wash",
              quantity: 1,
              unit_price_cents: 10000,
              line_total_cents: 10000,
            },
          ],
        };
        const {
          rows: [plan],
        } = await db.query(
          `select create_canes_repeat_plan($1::jsonb) as result`,
          [JSON.stringify(input)],
        );
        const {
          rows: [current],
        } = await db.query(`select id from jobs where plan_id=$1`, [
          plan.result.planId,
        ]);
        const {
          rows: [future],
        } = await db.query(
          `insert into jobs(plan_id,status,scheduled_at,plan_visit_due_on,total_cents) values($1,'scheduled','2042-02-28T13:00:00Z','2042-02-28',10000) returning id`,
          [plan.result.planId],
        );
        const {
          rows: [lease],
        } = await db.query(`select gen_random_uuid() as id`);
        await db.query(
          `select claim_job_cancellation_billing_locked($1,'scheduled',$2)`,
          [current.id, lease.id],
        );
        const lines = JSON.stringify([
          {
            name: "Wash",
            quantity: 1,
            unit_price_cents: 8000,
            line_total_cents: 8000,
            discount_mode: "amount",
            discount_value: 0,
            discount_cents: 0,
            taxable: false,
          },
        ]);
        const revise = async (futureVisits) => {
          const {
            rows: [graph],
          } = await db.query(`select canes_document_graph('job',$1) as graph`, [
            current.id,
          ]);
          return (
            await db.query(
              `select revise_canes_documents('job',$1,$2,$3::jsonb,$4::jsonb,'owner','verbal',$5) as result`,
              [
                current.id,
                graph.graph.fingerprint,
                lines,
                JSON.stringify({ future_visits: futureVisits }),
                lease.id,
              ],
            )
          ).rows[0].result.outcome;
        };
        assert.equal(await revise(false), "saved");
        assert.equal(
          (
            await db.query(`select total_cents from jobs where id=$1`, [
              future.id,
            ])
          ).rows[0].total_cents,
          10000,
        );
        assert.equal(await revise(true), "saved");
        assert.equal(
          (
            await db.query(`select total_cents from jobs where id=$1`, [
              future.id,
            ])
          ).rows[0].total_cents,
          8000,
        );
        assert.equal(
          (
            await db.query(
              `select price_per_visit_cents from recurring_plans where id=$1`,
              [plan.result.planId],
            )
          ).rows[0].price_per_visit_cents,
          8000,
        );
        assert.equal(
          (
            await db.query(
              `select count(*)::int as n from job_items where job_id=$1`,
              [future.id],
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "only unused drafts can be deleted, including fully refunded history",
      async () => {
        const {
          rows: [job],
        } = await db.query(
          `insert into jobs(status) values('scheduled') returning id`,
        );
        assert.equal(
          (
            await db.query(
              `select delete_canes_unused_document('job',$1) as result`,
              [job.id],
            )
          ).rows[0].result,
          "history",
        );
        const {
          rows: [draft],
        } = await db.query(
          `insert into invoices(number,status,public_token) values('TEST-DELETE','draft','delete-token') returning id`,
        );
        assert.equal(
          (
            await db.query(
              `select delete_canes_unused_document('invoice',$1) as result`,
              [draft.id],
            )
          ).rows[0].result,
          "deleted",
        );
        const {
          rows: [paid],
        } = await db.query(
          `insert into invoices(number,status,public_token) values('TEST-REFUNDED','draft','refunded-token') returning id`,
        );
        await db.query(
          `insert into payments(invoice_id,amount_cents,refunded_cents,currency,method,source,status,kind) values($1,1000,1000,'USD','cash','manual','refunded','deposit')`,
          [paid.id],
        );
        assert.equal(
          (
            await db.query(
              `select delete_canes_unused_document('invoice',$1) as result`,
              [paid.id],
            )
          ).rows[0].result,
          "history",
        );
      },
    );
    await t.test(
      "atomic recurring expense creation and future edit preserve earlier charges",
      async () => {
        const {
          rows: [rule],
        } = await db.query(
          `select create_canes_expense_rule(jsonb_build_object('name','Atomic expense','category','Software','amount_cents',1000,'frequency','monthly','starts_on',current_date::text,'next_due_on',current_date::text,'anchor_day',extract(day from current_date)::int,'cutover_on',current_date::text)) as id`,
        );
        assert.equal(
          (
            await db.query(
              `select edit_canes_expense_rule($1,'{"amount_cents":2000,"active":false}'::jsonb) as result`,
              [rule.id],
            )
          ).rows[0].result,
          "saved",
        );
        assert.equal(
          (
            await db.query(
              `select amount_cents from business_expenses where rule_id=$1`,
              [rule.id],
            )
          ).rows[0].amount_cents,
          1000,
        );
      },
    );
    await t.test(
      "new privileged functions cannot be called by ordinary authenticated users",
      async () => {
        const { rows } = await db.query(
          `select has_function_privilege('authenticated','mint_scheduled_plan_visit(uuid)','EXECUTE') as repeat,has_function_privilege('authenticated','generate_expense_occurrences()','EXECUTE') as expense,has_function_privilege('authenticated','claim_meta_leadgen(text)','EXECUTE') as meta`,
        );
        assert.equal(rows[0].repeat, false);
        assert.equal(rows[0].expense, false);
        assert.equal(rows[0].meta, false);
      },
    );
    await t.test("expense rule starting on the 1st still mints this month", async () => {
      const {
        rows: [month],
      } = await db.query(
        `select date_trunc('month', now() at time zone 'America/New_York')::date::text as start`,
      );
      const {
        rows: [rule],
      } = await db.query(
        `select create_canes_expense_rule(jsonb_build_object('name','First-of-month rule','category','Software','amount_cents',2500,'frequency','monthly','starts_on',$1::text,'next_due_on',$1::text,'anchor_day',1,'cutover_on',$1::text)) as id`,
        [month.start],
      );
      assert.equal(
        (
          await db.query(
            `select count(*)::int as n from business_expenses where rule_id=$1 and occurrence_on=$2::date`,
            [rule.id, month.start],
          )
        ).rows[0].n,
        1,
      );
    });
    await t.test("meta leadgen id is unique and fill-blanks leave website source", async () => {
      const {
        rows: [lead],
      } = await db.query(
        `insert into leads(type,status,source,phone,name) values('cold','new','website','+15555550199','Existing') returning id`,
      );
      assert.equal(
        (await db.query(`select claim_meta_leadgen('lg-1') as state`)).rows[0].state,
        "acquired",
      );
      assert.equal(
        (await db.query(`select claim_meta_leadgen('lg-1') as state`)).rows[0].state,
        "busy",
      );
      await db.query(
        `select apply_meta_lead_existing_update('lg-1',$1,'','a@b.com','1 Main','','Meta note',false)`,
        [lead.id],
      );
      const {
        rows: [row],
      } = await db.query(
        `select source,name,email,address,notes,meta_leadgen_id from leads where id=$1`,
        [lead.id],
      );
      assert.equal(row.source, "website");
      assert.equal(row.name, "Existing");
      assert.equal(row.email, "a@b.com");
      assert.equal(row.address, "1 Main");
      assert.equal(row.meta_leadgen_id, "lg-1");
      await db.query(`select finish_meta_leadgen('lg-1','existing',$1)`, [lead.id]);
      assert.equal(
        (await db.query(`select claim_meta_leadgen('lg-1') as state`)).rows[0].state,
        "completed",
      );
      const {
        rows: [other],
      } = await db.query(
        `insert into leads(type,status,source,phone) values('cold','new','other','+15555550198') returning id`,
      );
      await db.query(`select claim_meta_leadgen('lg-2')`);
      await db.query(
        `select apply_meta_lead_existing_update('lg-2',$1,'Pat','','','','',true)`,
        [other.id],
      );
      assert.equal(
        (
          await db.query(`select source,name from leads where id=$1`, [other.id])
        ).rows[0].source,
        "meta_ads",
      );
      await db.query(
        `insert into leads(type,status,source,phone,meta_leadgen_id) values('cold','new','meta_ads','+15555550197','lg-unique')`,
      );
      await assert.rejects(() =>
        db.query(
          `insert into leads(type,status,source,phone,meta_leadgen_id) values('cold','new','meta_ads','+15555550196','lg-unique')`,
        ),
      );
    });
  } finally {
    await db.close();
  }
});

test("document revisions refuse uncertain Square results without writing prices", async (t) => {
  for (const [state, reconciled, expectedSaved] of [
    ["error", true, false],
    ["payment_pending", true, false],
    ["canceled", false, false],
    ["canceled", true, true],
  ]) {
    await t.test(`${state}, reconciled ${reconciled}`, async () => {
      const calls = [];
      const updates = [];
      const graph = {
        fingerprint: "version",
        estimate: null,
        job: null,
        invoice: {
          id: "invoice",
          number: "INV",
          status: "sent",
          square_invoice_id: "square",
          total_cents: 10000,
          amount_paid_cents: 0,
          items: [],
        },
      };
      const chain = {
        update(patch) {
          updates.push(patch);
          return this;
        },
        eq() {
          return this;
        },
        then(resolve) {
          resolve({ error: null });
        },
      };
      const actions = source("app/CanesPressure/document-actions.ts", {
        "node:crypto": { randomUUID: () => "lease" },
        "next/cache": { revalidatePath: () => {} },
        "@/lib/canes/supabase": {
          canesConfigured: () => true,
          canesDb: () => ({
            from: () => chain,
            rpc: async (name, args) => {
              calls.push({ name, args });
              return {
                error: null,
                data:
                  name === "canes_document_graph"
                    ? graph
                    : name === "claim_canes_invoice_revision"
                      ? true
                      : name === "revise_canes_documents"
                        ? { outcome: "saved" }
                        : null,
              };
            },
          }),
        },
        "@/lib/canes/access": { denyUnlessPermitted: async () => null },
        "@/lib/urso-auth": {
          getAdminSession: async () => ({ email: "test-owner" }),
        },
        "@/lib/canes/crew-auth": { getTechnicianActor: async () => null },
        "@/lib/canes/square": {
          retireSquareInvoice: async () => state,
          squareRevisionLedgerMatches: async () => reconciled,
          deleteDepositLink: async () => true,
        },
        "@/lib/canes/invoices": {},
        "@/lib/canes/estimates": {},
        "@/app/CanesPressure/actions": {},
      });
      const result = await actions.applyDocumentChange("invoice", "invoice", {
        fingerprint: "version",
        lines: [{ name: "Wash", quantity: 1, unitPriceCents: 8000 }],
        adjustmentCents: 0,
        taxRateBps: 0,
        terms: "",
        agreement: "verbal",
      });
      assert.equal(result.ok, expectedSaved);
      assert.equal(
        calls.some((call) => call.name === "revise_canes_documents"),
        expectedSaved,
      );
      assert.equal(calls.at(-1).name, "release_invoice_billing_operation");
      if (state === "canceled")
        assert.ok(updates.some((patch) => patch.hosted_payment_url === null));
    });
  }
});

test("signatures require bounded inert drawing data", () => {
  const { validSignature } = source("lib/canes/signatures.ts");
  assert.equal(
    validSignature({
      width: 600,
      height: 180,
      strokes: [
        [
          [0, 0],
          [10, 10],
          [20, 20],
          [30, 30],
          [40, 40],
        ],
      ],
    }),
    true,
  );
  assert.equal(
    validSignature({
      width: 600,
      height: 180,
      strokes: [
        [
          [0, 0],
          [10, 10],
          [20, 20],
          [30, 30],
          [601, 40],
        ],
      ],
    }),
    false,
  );
  assert.equal(validSignature({ width: 600, height: 180, strokes: [] }), false);
  assert.equal(validSignature('<svg onload="alert(1)">'), false);
});
