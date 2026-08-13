export const LEARNING_CENTRE_AUDIENCES = ["customer", "rider", "merchant"] as const;
export type LearningCentreAudience = (typeof LEARNING_CENTRE_AUDIENCES)[number];

export type LearningCentreVideoRow = {
  id: number;
  audience: LearningCentreAudience;
  section_title: string;
  video_title: string;
  youtube_url: string;
  thumbnail_r2_key: string | null;
  thumbnail_proxy_url: string | null;
  duration_label: string | null;
  section_number: number;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
};

export function parseLearningCentreAudience(value: string): LearningCentreAudience | null {
  const v = String(value ?? "").trim().toLowerCase();
  return LEARNING_CENTRE_AUDIENCES.includes(v as LearningCentreAudience)
    ? (v as LearningCentreAudience)
    : null;
}
