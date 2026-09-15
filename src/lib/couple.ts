export const COUPLE_DISPLAY_FORMATS = ["BRIDE_GROOM", "GROOM_BRIDE", "CUSTOM"] as const;
export type CoupleDisplayFormatValue = (typeof COUPLE_DISPLAY_FORMATS)[number];

export function formatCoupleName(input: {
  brideName: string;
  groomName: string;
  format: CoupleDisplayFormatValue;
  customDisplayName?: string | null;
}): string {
  if (input.format === "CUSTOM" && input.customDisplayName?.trim()) {
    return input.customDisplayName.trim();
  }
  if (input.format === "GROOM_BRIDE") {
    return `${input.groomName} & ${input.brideName}`;
  }
  return `${input.brideName} & ${input.groomName}`;
}
