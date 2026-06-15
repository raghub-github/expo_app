/**
 * User profile (onboarding) – get and update. Maps to user_profiles table.
 * profile_completed gates app access; permissions stored for settings.
 */

import api from "./api";

const ME_PREFIX = "/v1/me";
const PROFILE_PATH = `${ME_PREFIX}/profile`;

export type Gender = "male" | "female" | "prefer_not_to_say" | "others";

export type UserProfile = {
  profile_completed: boolean;
  customer_id?: string | null;
  user_id?: string | null;
  mobile_number?: string;
  full_name?: string | null;
  email?: string | null;
  age_group?: string | null;
  gender?: Gender | null;
  sms_permission?: boolean;
  location_permission?: boolean;
  contacts_permission?: boolean;
  referral_code?: string | null;
  referred_by?: string | null;
  is_email_verified?: boolean;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string;
  updated_at?: string;
  /** GMitra Plus membership — true when subscription is active. */
  gmitra_plus_active?: boolean;
  /** Profile photo from verified email (Gravatar / Google). */
  profile_image_url?: string | null;
  /** Total discount saved across all completed orders (INR). */
  lifetime_savings_inr?: number;
};

export type UpdateProfilePayload = {
  full_name?: string;
  email?: string;
  age_group?: string;
  gender?: Gender;
  profile_completed?: boolean;
  sms_permission?: boolean;
  location_permission?: boolean;
  contacts_permission?: boolean;
  referred_by?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
};

export const AGE_GROUPS = [
  "10-15",
  "16-21",
  "22-27",
  "28-33",
  "34-39",
  "40-45",
  "46-51",
  "52-57",
  "58-63",
  "64-69",
  "70-75",
  "76-81",
  "82-87",
  "88-93",
  "94-95",
] as const;

export const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
  { value: "others", label: "Others" },
];

export const profileService = {
  async getProfile(): Promise<UserProfile> {
    const { data } = await api.get<UserProfile>(PROFILE_PATH);
    return data;
  },

  async updateProfile(payload: UpdateProfilePayload): Promise<UserProfile> {
    const { data } = await api.patch<UserProfile>(PROFILE_PATH, payload);
    return data;
  },

  async sendEmailVerificationCode(): Promise<{ sent: boolean; email: string }> {
    const { data } = await api.post<{ sent: boolean; email: string }>(
      `${ME_PREFIX}/email-verification/send`
    );
    return data;
  },

  async confirmEmailVerification(code: string): Promise<{ verified: boolean; is_email_verified: boolean; profile_image_url?: string | null }> {
    const { data } = await api.post<{ verified: boolean; is_email_verified: boolean; profile_image_url?: string | null }>(
      `${ME_PREFIX}/email-verification/confirm`,
      { code }
    );
    return data;
  },
};
