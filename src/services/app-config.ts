export type AppLanguage = 'th' | 'en';

export const parseAppLanguage = (value: string | undefined, fallback: AppLanguage = 'en'): AppLanguage => {
  return value?.trim().toLowerCase() === 'en' ? 'en' : value?.trim().toLowerCase() === 'th' ? 'th' : fallback;
};

export const getDefaultLanguage = (fallback: AppLanguage = 'en'): AppLanguage => parseAppLanguage(process.env.DEFAULT_LANGUAGE, fallback);