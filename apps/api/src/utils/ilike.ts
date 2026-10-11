export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, '\\$&');
