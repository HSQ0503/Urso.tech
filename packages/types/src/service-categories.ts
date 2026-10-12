export const STANDARD_SERVICES = [
  { key: "paver_sealing", name: "Paver Sealing", recurring: false },
  { key: "roof_washing", name: "Roof Washing", recurring: false },
  { key: "house_washing", name: "House Washing", recurring: true },
  { key: "window_cleaning", name: "Window Cleaning", recurring: true },
  { key: "gutter_cleaning", name: "Gutter Cleaning", recurring: true },
  {
    key: "paver_concrete_cleaning",
    name: "Paver/Concrete Cleaning",
    recurring: true,
  },
] as const;

export type ServiceCategory =
  | (typeof STANDARD_SERVICES)[number]["key"]
  | "custom";

export function isServiceCategory(value: unknown): value is ServiceCategory {
  return (
    value === "custom" ||
    STANDARD_SERVICES.some((service) => service.key === value)
  );
}

export function recurringServiceEligible(
  category: ServiceCategory | null | undefined,
): boolean {
  return (
    category === "custom" ||
    STANDARD_SERVICES.some(
      (service) => service.key === category && service.recurring,
    )
  );
}

export function serviceCategoryLabel(
  category: ServiceCategory | null | undefined,
): string {
  return category === "custom"
    ? "Custom service"
    : (STANDARD_SERVICES.find((service) => service.key === category)?.name ??
        "Uncategorized");
}
