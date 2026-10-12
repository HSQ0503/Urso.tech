export const SQUARE_ENV = process.env.CANES_SQUARE_ENV ?? "production";
export const SQUARE_API_BASE =
  SQUARE_ENV === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
export const SQUARE_VERSION = "2026-07-15";
export function squareHeaders() {
  return {
    Authorization: `Bearer ${process.env.CANES_SQUARE_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
    "Square-Version": SQUARE_VERSION,
  };
}
