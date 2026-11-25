/**
 * A WORKSPACE'S BUSINESS — api-contract 1.2, bz-a1…bz-a3 (V46). Types and plain constants, no `server-only` (trap 18): the
 * Business form and the invoice sheet are client components.
 */

export interface BusinessAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}

export interface BusinessWire {
  tenantId: string;
  type: 'solo' | 'team' | 'gym';
  /** The workspace's own name — the one the switcher shows. */
  name: string;
  tagline?: string | null;
  phone?: string | null;
  email?: string | null;
  address: Partial<BusinessAddress>;
  upiVpa?: string | null;
  /** V50 — may a client report paying part of what is left on a pack? Business → Payment setup's switch. Default on. */
  partPayments: boolean;
  /** Whether the caller owns the workspace. Everyone else reads it. */
  canEdit: boolean;
  updatedAt: number;
}

export interface BusinessWrite {
  name: string;
  tagline: string | null;
  phone: string | null;
  email: string | null;
  address: BusinessAddress;
  /**
   * Absent since V50 (23 Nov 2026): the UPI ID moved to Business → Payment setup, and the server reads an absent key as
   * "leave it". Sent — a value or null — it still sets or clears.
   */
  upiVpa?: string | null;
}

/** `PUT /v1/business/payments` (bz-a4): Payment setup's one Save. */
export interface PaymentSetupWrite {
  upiVpa: string | null;
  partPayments: boolean;
}

/** The server's caps — refused over, never trimmed (V33's rule). */
export const BUSINESS_LIMITS = { name: 160, tagline: 120, line: 120, city: 80, email: 254, upi: 100 } as const;

/** India's 28 states and 8 union territories, by name — `IndianStates.java` is the same list, and the server refuses others. */
export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
] as const;

/** The address as lines on a bill: "12, 3rd Cross", "Adyar", "Chennai, Tamil Nadu 600041". Empty parts are left out. */
export function addressLines(a: Partial<BusinessAddress> | null | undefined): string[] {
  if (!a) return [];
  const place = [a.city, [a.state, a.pincode].filter(Boolean).join(' ')].filter((x) => x && x.trim()).join(', ');
  return [a.line1, a.line2, place].filter((x): x is string => !!x && x.trim() !== '');
}
