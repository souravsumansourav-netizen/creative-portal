export type Role = "uploader" | "approver" | "creator" | "pdp_uploader" | "performance" | "admin";
export const ROLES: Role[] = ["uploader", "approver", "creator", "pdp_uploader", "performance", "admin"];

export const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: "/upload", label: "Upload", roles: ["uploader"] },
  { href: "/triage", label: "Triage", roles: ["approver"] },
  { href: "/review", label: "Review", roles: ["approver"] },
  { href: "/rework", label: "Sent back", roles: ["approver"] },
  { href: "/library", label: "Library", roles: ["approver"] },
  { href: "/routing", label: "Routing", roles: ["approver"] },
  { href: "/dashboard", label: "Dashboard", roles: ["approver"] },
  { href: "/production", label: "Production", roles: ["creator"] },
  { href: "/output/pdp", label: "PDP", roles: ["pdp_uploader"] },
  { href: "/output/performance", label: "Performance", roles: ["performance"] },
  { href: "/admin/batches", label: "Batches", roles: [] },
  { href: "/admin/users", label: "Users", roles: [] },
];

export const homeFor = (role: Role): string =>
  ({
    uploader: "/upload",
    approver: "/dashboard",
    creator: "/production",
    pdp_uploader: "/output/pdp",
    performance: "/output/performance",
    admin: "/dashboard",
  })[role];

export const REJECT_REASONS: { value: string; label: string }[] = [
  { value: "color_gold_tone", label: "Colour / gold tone" },
  { value: "lighting", label: "Lighting" },
  { value: "background", label: "Background" },
  { value: "crop", label: "Crop" },
  { value: "wrong_sku", label: "Wrong SKU" },
  { value: "brand_guideline", label: "Brand guideline" },
  { value: "other", label: "Other" },
];

export const STAGES = ["in_production", "submitted", "in_review", "approved", "done"] as const;

// Cloudflare R2 free tier = 10 GB. Admins are alerted from 9 GB so they can delete batches before overage charges.
export const STORAGE_LIMIT_BYTES = 10_000_000_000;
export const STORAGE_ALERT_BYTES = 9_000_000_000;
export const formatBytes = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`;

// Reference ("original") image shown next to the creator's upload on the review screen.
// URL = base + SKU (upper-case) + "_1.jpg?". Override the base with NEXT_PUBLIC_REFERENCE_IMAGE_BASE if the
// catalogue's content hash (the "dwf82e38ca" part) ever changes.
export const REFERENCE_IMAGE_BASE =
  process.env.NEXT_PUBLIC_REFERENCE_IMAGE_BASE ??
  "https://www.tanishq.co.in/dw/image/v2/BKCK_PRD/on/demandware.static/-/Sites-Tanishq-product-catalog/default/dwf82e38ca/images/hi-res/";
export const referenceUrl = (sku: string) => `${REFERENCE_IMAGE_BASE}${sku.trim().toUpperCase()}_1.jpg?`;
