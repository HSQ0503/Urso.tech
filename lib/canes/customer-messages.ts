import { fmtEt } from "@urso/types";

export const CANES_CUSTOMER_PHONE = "+15615375674";

function greeting(name: string | null): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Hey ${first},` : "Hey,";
}

export function estimateText(
  name: string | null,
  link: string,
  reminder = false,
): string {
  return `${greeting(name)} this is Canes Pressure Washing! ${reminder ? "Just following up on your estimate" : "Here is your estimate"}: ${link}`;
}

export function jobReminderText(
  name: string | null,
  scheduledAt: string,
  link: string,
): string {
  const day = fmtEt(scheduledAt, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const time = fmtEt(scheduledAt, { hour: "numeric", minute: "2-digit" });
  return `${greeting(name)} this is Canes Pressure Washing! Just a reminder that your appointment is scheduled for ${day} at ${time} Eastern. If you need to reschedule, please call or text us at 561-537-5674. Here's the link to view your scheduled job: ${link} See you soon! - Canes Pressure Washing`;
}
