"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createManualInvoice } from "@/app/CanesPressure/actions";
import { ServiceLinesEditor } from "../service-lines-editor";
import { priceServices, type ServiceLineInput } from "@urso/types";
import { fmtMoney } from "@/lib/canes/types";
import type { CustomerHit } from "@/lib/canes/customers";
import { AddressInput } from "../address-input";
import { CustomerPicker } from "../customer-picker";
import { PhoneInput } from "../phone-input";

// Standalone invoice, no job behind it — Sebastian's "new invoice from the
// invoice section" ask. Client-first like every create flow; lands on the
// invoice detail page where he sends it or records cash.

export function NewInvoiceForm({ customers }: { customers: CustomerHit[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [jobAddress, setJobAddress] = useState("");
  const [jobName, setJobName] = useState("");
  const [lines, setLines] = useState<ServiceLineInput[]>([]);
  const [contact, setContact] = useState<CustomerHit | null>(null);
  const [pickSeq, setPickSeq] = useState(0);
  const applied = useRef<{ phone: string; email: string; address: string }>({
    phone: "",
    email: "",
    address: "",
  });

  const digits = (v: string) => v.replace(/\D/g, "");

  function pickCustomer(hit: CustomerHit) {
    setContact(hit);
    setPickSeq((n) => n + 1);
    setCustomerName(hit.name ?? "");
    setCustomerPhone(hit.phone ?? "");
    setCustomerEmail(hit.email ?? "");
    setJobAddress(hit.address ?? "");
    applied.current = {
      phone: hit.phone ?? "",
      email: hit.email ?? "",
      address: hit.address ?? "",
    };
  }

  function changeName(name: string) {
    setCustomerName(name);
    if (contact && name.trim() !== (contact.name ?? "").trim()) {
      setContact(null);
      if (digits(customerPhone) === digits(applied.current.phone))
        setCustomerPhone("");
      if (customerEmail === applied.current.email) setCustomerEmail("");
      if (jobAddress === applied.current.address) setJobAddress("");
      applied.current = { phone: "", email: "", address: "" };
      setPickSeq((n) => n + 1);
    }
  }

  let cents = 0;
  try {
    cents = priceServices(lines).totalCents;
  } catch {
    /* The form stays editable. */
  }
  const canSubmit =
    customerName.trim().length > 0 && jobName.trim().length > 0 && cents > 0;

  function submit() {
    setNotice("");
    startTransition(async () => {
      const res = await createManualInvoice({
        contactId: contact?.id,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        jobAddress: jobAddress.trim() || undefined,
        jobName: jobName.trim(),
        totalCents: cents,
        items: lines,
      });
      if (res.ok && res.invoiceId) {
        router.push(`/CanesPressure/invoices/${res.invoiceId}`);
        return;
      }
      setNotice(res.notice ?? "Could not create the invoice.");
    });
  }

  return (
    <div className="cp-card max-w-[560px] space-y-3 p-4">
      <div>
        <label className="cp-label" htmlFor="ni-customer">
          Client name
        </label>
        <CustomerPicker
          id="ni-customer"
          customers={customers}
          value={customerName}
          onChange={changeName}
          onPick={pickCustomer}
          linkedId={contact?.id ?? null}
        />
      </div>

      <div>
        <label className="cp-label" htmlFor="ni-phone">
          Phone (optional)
        </label>
        <PhoneInput
          key={`${contact?.id ?? "new"}:${pickSeq}`}
          id="ni-phone"
          defaultValue={customerPhone}
          onChange={setCustomerPhone}
        />
      </div>

      <div>
        <label className="cp-label" htmlFor="ni-email">
          Email (optional)
        </label>
        <input
          id="ni-email"
          type="email"
          className="cp-input"
          placeholder="name@email.com"
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
        />
      </div>

      <div>
        <label className="cp-label" htmlFor="ni-for">
          For
        </label>
        <input
          id="ni-for"
          className="cp-input"
          placeholder="Driveway and walkway wash"
          value={jobName}
          onChange={(e) => setJobName(e.target.value)}
        />
      </div>

      <ServiceLinesEditor lines={lines} onChange={setLines} />

      <div>
        <label className="cp-label" htmlFor="ni-address">
          Service address (optional)
        </label>
        <AddressInput
          id="ni-address"
          value={jobAddress}
          onChange={setJobAddress}
        />
      </div>

      {notice && (
        <p className="text-[12.5px] leading-snug text-[var(--cp-warn)]">
          {notice}
        </p>
      )}

      <button
        type="button"
        className="cp-btn cp-btn-primary cp-btn-block"
        disabled={!canSubmit || isPending}
        onClick={submit}
      >
        {isPending
          ? "Creating..."
          : cents > 0
            ? `Create invoice (${fmtMoney(cents)})`
            : "Create invoice"}
      </button>
      <p className="text-[12px] leading-snug text-[var(--cp-faint)]">
        Opens as a draft — review it, then send by text/email or record cash.
      </p>
    </div>
  );
}
