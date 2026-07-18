// Client-safe permission constants (no Node/Shopify imports) — usable in the browser.
export const PERMISSIONS = [
  { key: "inventory", label: "Inventory", desc: "View & edit products, stock, prices" },
  { key: "billing", label: "Billing / POS", desc: "Create bills & take payments" },
  { key: "invoices", label: "Invoices", desc: "View, edit, send & export invoices" },
  { key: "orders", label: "Orders", desc: "View & manage store/marketplace orders" },
  { key: "customers", label: "Customers", desc: "Register & manage customers" },
  { key: "collections", label: "Collections", desc: "Organise collections" },
  { key: "reports", label: "Reports", desc: "Sales & team performance" },
  { key: "settings", label: "Settings", desc: "Business & portal settings" },
  { key: "users", label: "Team management", desc: "Add teammates & set access" },
] as const;

export type PermKey = (typeof PERMISSIONS)[number]["key"];
export const ALL_PERMS: PermKey[] = PERMISSIONS.map((p) => p.key);
// Sensible starting access for a brand-new teammate (owner can widen/narrow).
export const DEFAULT_MEMBER_PERMS: PermKey[] = ["inventory", "billing", "invoices", "orders", "customers"];
