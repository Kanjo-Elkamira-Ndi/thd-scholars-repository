import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../utils/errors';
import { safeEqualHex } from './constant-time';

export const FUTURE_SKEW_SECONDS = 60;

const initDataUserSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1).optional(),
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
});

export interface VerifiedInitData {
  telegramId: number;
  username: string | null;
  fullName: string;
}

function unauthorized(message: string): never {
  throw new AppError('UNAUTHORIZED', message, 401);
}

export const buildDataCheckString = (params: Map<string, string>): string =>
  [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

export const computeInitDataHash = (params: Map<string, string>, botToken: string): string => {
  const dataCheckString = buildDataCheckString(params);
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  return createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
};

const encodeParam = (value: string): string => encodeURIComponent(value);

export const signInitData = (
  input: { telegramId: number; username?: string; firstName?: string; lastName?: string },
  botToken: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string => {
  const params = new Map<string, string>([
    [
      'user',
      JSON.stringify({
        id: input.telegramId,
        username: input.username,
        first_name: input.firstName,
        last_name: input.lastName,
      }),
    ],
    ['auth_date', String(nowSeconds)],
  ]);
  const hash = computeInitDataHash(params, botToken);
  params.set('hash', hash);
  return [...params.entries()]
    .map(([key, value]) => `${encodeParam(key)}=${encodeParam(value ?? '')}`)
    .join('&');
};

const parseInitData = (initData: string): Map<string, string> => {
  const params = new Map<string, string>();
  for (const pair of initData.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq === -1) return new Map();
    const key = decodeURIComponent(pair.slice(0, eq));
    const value = decodeURIComponent(pair.slice(eq + 1));
    params.set(key, value);
  }
  return params;
};

export const verifyTelegramInitData = (
  initData: string,
  botToken: string,
  maxAgeSeconds: number,
): VerifiedInitData => {
  if (!initData) unauthorized('invalid initData format');
  const params = parseInitData(initData);

  const hash = params.get('hash');
  if (!hash) unauthorized('initData missing hash');
  const computedHash = computeInitDataHash(params, botToken);
  if (!safeEqualHex(computedHash, hash)) {
    unauthorized('initData signature mismatch');
  }

  const authDateStr = params.get('auth_date');
  if (!authDateStr) unauthorized('invalid initData format');
  const authDate = Number(authDateStr);
  if (!Number.isInteger(authDate) || authDate <= 0) {
    unauthorized('invalid initData format');
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - authDate > maxAgeSeconds) {
    unauthorized('initData expired');
  }
  if (authDate - nowSeconds > FUTURE_SKEW_SECONDS) {
    unauthorized('initData from the future');
  }

  const rawUser = params.get('user');
  if (!rawUser) unauthorized('initData missing user');
  let parsedUser;
  try {
    parsedUser = initDataUserSchema.safeParse(JSON.parse(rawUser));
  } catch {
    parsedUser = { success: false as const };
  }
  if (!parsedUser.success) unauthorized('initData missing user');

  const { id, username, first_name, last_name } = parsedUser.data;
  const fullName =
    [first_name, last_name].filter(Boolean).join(' ').trim() || `Telegram user ${id}`;
  return { telegramId: id, username: username ?? null, fullName };
};
