import "server-only";
import { getTheme, INVITATION_THEMES, isThemeCode, type InvitationTheme } from "@/lib/invitation-themes";
import { getDb } from "@/server/db";

export type ThemeCatalogEntry = {
  code: string;
  name: string;
  description: string;
  isEnabled: boolean;
  isPremium: boolean;
  sortOrder: number;
  /** The code-defined theme, for tokens and previews. */
  theme: InvitationTheme;
};

/**
 * Themes are code (developer-deployed); admins only control metadata. A theme without a settings
 * row keeps its code defaults: enabled, not premium, code order.
 */
export async function getThemeCatalog(): Promise<ThemeCatalogEntry[]> {
  const settings = await getDb().invitationThemeSetting.findMany();
  const byCode = new Map(settings.map((row) => [row.code, row]));
  return INVITATION_THEMES.map((theme, index) => {
    const row = byCode.get(theme.code);
    return {
      code: theme.code,
      name: row?.displayName ?? theme.name,
      description: row?.description ?? theme.description,
      isEnabled: row?.isEnabled ?? true,
      isPremium: row?.isPremium ?? false,
      sortOrder: row?.sortOrder ?? (index + 1) * 10,
      theme,
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

export type ThemeChoiceProblem = "unknown" | "disabled" | "premium";

/**
 * Whether a wedding may switch to a theme. Keeping the theme it already uses is always allowed, so
 * disabling or re-pricing a theme never breaks a published invitation.
 */
export async function themeChoiceProblem(
  code: string,
  options: { currentThemeCode: string; hasPremiumThemes: boolean },
): Promise<ThemeChoiceProblem | null> {
  if (!isThemeCode(code)) return "unknown";
  if (code === options.currentThemeCode) return null;
  const entry = (await getThemeCatalog()).find((item) => item.code === code);
  if (!entry || !entry.isEnabled) return "disabled";
  if (entry.isPremium && !options.hasPremiumThemes) return "premium";
  return null;
}

export function themeDisplayName(code: string): string {
  return getTheme(code).name;
}
