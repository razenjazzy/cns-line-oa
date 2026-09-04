export const toPositiveInt = (value: unknown, fallback: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    const normalized = Math.trunc(value);
    return normalized > 0 ? normalized : fallback;
};

export const toOptionalString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    return normalized || undefined;
};

export const toErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;
    return String(error);
};
