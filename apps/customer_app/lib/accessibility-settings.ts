/** Customer accessibility preference values — stored on `customers` table. */

export type HearingAccessibility = "deaf" | "hard_of_hearing" | "none";
export type VisionAccessibility = "blind" | "visual_impairment" | "none";
export type MobilityAccessibility =
  | "wheelchair_or_mobility_aid"
  | "physical_disability_mobility"
  | "none";

export type AccessibilityPreferences = {
  hearing_accessibility: HearingAccessibility;
  vision_accessibility: VisionAccessibility;
  mobility_accessibility: MobilityAccessibility;
};

export const DEFAULT_ACCESSIBILITY_PREFERENCES: AccessibilityPreferences = {
  hearing_accessibility: "none",
  vision_accessibility: "none",
  mobility_accessibility: "none",
};

export type AccessibilitySection = {
  id: "hearing" | "vision" | "mobility";
  title: string;
  subtitle: string;
  icon: "ear-outline" | "eye-outline" | "accessibility-outline";
  field: keyof AccessibilityPreferences;
  options: Array<{ value: string; label: string }>;
};

export const ACCESSIBILITY_SECTIONS: AccessibilitySection[] = [
  {
    id: "hearing",
    title: "Hearing",
    subtitle: "Select level of hearing impairment if any",
    icon: "ear-outline",
    field: "hearing_accessibility",
    options: [
      { value: "deaf", label: "I'm deaf" },
      { value: "hard_of_hearing", label: "I'm hard of hearing" },
      { value: "none", label: "I'm not deaf or hard of hearing" },
    ],
  },
  {
    id: "vision",
    title: "Vision",
    subtitle: "Select level of vision impairment if any",
    icon: "eye-outline",
    field: "vision_accessibility",
    options: [
      { value: "blind", label: "I'm blind" },
      { value: "visual_impairment", label: "I have a visual impairment" },
      { value: "none", label: "I'm not blind or visually impaired" },
    ],
  },
  {
    id: "mobility",
    title: "Mobility",
    subtitle: "Select level of mobility impairment if any",
    icon: "accessibility-outline",
    field: "mobility_accessibility",
    options: [
      { value: "wheelchair_or_mobility_aid", label: "I use a wheelchair or mobility aid" },
      {
        value: "physical_disability_mobility",
        label: "I have a physical disability that affects my mobility",
      },
      { value: "none", label: "I do not have a physical or mobility impairment" },
    ],
  },
];

export function accessibilityFromProfile(
  profile: Partial<AccessibilityPreferences> | null | undefined
): AccessibilityPreferences {
  return {
    hearing_accessibility:
      profile?.hearing_accessibility ?? DEFAULT_ACCESSIBILITY_PREFERENCES.hearing_accessibility,
    vision_accessibility:
      profile?.vision_accessibility ?? DEFAULT_ACCESSIBILITY_PREFERENCES.vision_accessibility,
    mobility_accessibility:
      profile?.mobility_accessibility ?? DEFAULT_ACCESSIBILITY_PREFERENCES.mobility_accessibility,
  };
}

export function accessibilityEquals(a: AccessibilityPreferences, b: AccessibilityPreferences): boolean {
  return (
    a.hearing_accessibility === b.hearing_accessibility &&
    a.vision_accessibility === b.vision_accessibility &&
    a.mobility_accessibility === b.mobility_accessibility
  );
}
