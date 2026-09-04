export type AppLanguage = 'th' | 'en';

export const parseAppLanguage = (value: string | undefined, fallback: AppLanguage = 'th'): AppLanguage => {
  return value?.trim().toLowerCase() === 'en' ? 'en' : value?.trim().toLowerCase() === 'th' ? 'th' : fallback;
};

export const getDefaultLanguage = (fallback: AppLanguage = 'th'): AppLanguage => parseAppLanguage(process.env.DEFAULT_LANGUAGE, fallback);