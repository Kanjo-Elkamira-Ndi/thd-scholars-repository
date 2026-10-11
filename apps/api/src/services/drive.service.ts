import { createSign } from 'node:crypto';
import { Readable } from 'node:stream';
import { AppError } from '../utils/errors';

export interface DriveUploadSource {
  stream: Readable;
  byteLength?: number;
}

export interface DriveService {
  isConfigured: boolean;
  uploadFile(
    source: DriveUploadSource,
    meta: { mimeType: string; name: string },
  ): Promise<{ webViewLink: string }>;
}

export interface CreateDriveServiceInput {
  serviceAccountJson: string | null;
  folderId: string | null;
  fetchImpl?: typeof fetch;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

const b64url = (input: Buffer | string): string => Buffer.from(input).toString('base64url');

const parseServiceAccount = (json: string | null): ServiceAccount | null => {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<ServiceAccount>;
    if (!parsed.client_email || !parsed.private_key) return null;
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, '\n'),
    };
  } catch {
    return null;
  }
};

export function createDriveService(input: CreateDriveServiceInput): DriveService {
  const account = parseServiceAccount(input.serviceAccountJson);
  const fetchImpl = input.fetchImpl ?? fetch;
  const folderId = input.folderId;
  const configured = account !== null && folderId !== null;
  let cachedToken: { value: string; expiresAt: number } | null = null;

  const buildJwt = (now: number): string => {
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64url(
      JSON.stringify({
        iss: account?.client_email,
        scope: 'https://www.googleapis.com/auth/drive',
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    );
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claim}`);
    const signature = signer.sign(account?.private_key ?? '');
    return `${header}.${claim}.${b64url(signature)}`;
  };

  const getAccessToken = async (): Promise<string> => {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: buildJwt(Math.floor(Date.now() / 1000)),
      }).toString(),
    });
    if (!response.ok) {
      throw new AppError('INTERNAL_ERROR', `Drive token request failed (${response.status})`);
    }
    const payload = (await response.json()) as { access_token: string; expires_in: number };
    cachedToken = {
      value: payload.access_token,
      expiresAt: Date.now() + (payload.expires_in - 60) * 1000,
    };
    return cachedToken.value;
  };

  return {
    isConfigured: configured,
    async uploadFile(source, meta) {
      if (!configured || !folderId) {
        throw new AppError('INTERNAL_ERROR', 'Google Drive is not configured');
      }

      const token = await getAccessToken();

      const createResponse = await fetchImpl(
        `${DRIVE_UPLOAD_URL}?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json; charset=UTF-8',
            'x-upload-content-type': meta.mimeType,
          },
          body: JSON.stringify({
            name: meta.name,
            parents: [folderId],
            copyRequiresWriterPermission: true,
          }),
        },
      );
      if (!createResponse.ok) {
        throw new AppError(
          'INTERNAL_ERROR',
          `Drive upload session failed (${createResponse.status})`,
        );
      }
      const sessionUri = createResponse.headers.get('location');
      if (!sessionUri) {
        throw new AppError('INTERNAL_ERROR', 'Drive upload session missing Location header');
      }

      const uploadInit = {
        method: 'PUT',
        headers: {
          'content-type': meta.mimeType,
          ...(source.byteLength !== undefined
            ? { 'content-length': String(source.byteLength) }
            : {}),
        },
        body: Readable.toWeb(source.stream) as unknown as BodyInit,
        duplex: 'half',
      } as RequestInit;
      const uploadResponse = await fetchImpl(sessionUri, uploadInit);
      if (!uploadResponse.ok) {
        throw new AppError('INTERNAL_ERROR', `Drive upload failed (${uploadResponse.status})`);
      }
      const uploaded = (await uploadResponse.json()) as { id?: string; webViewLink?: string };
      if (!uploaded.id || !uploaded.webViewLink) {
        throw new AppError('INTERNAL_ERROR', 'Drive upload returned no web view link');
      }

      const permissionResponse = await fetchImpl(
        `${DRIVE_FILES_URL}/${uploaded.id}/permissions?supportsAllDrives=true`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ role: 'reader', type: 'anyone' }),
        },
      );
      if (!permissionResponse.ok) {
        throw new AppError(
          'INTERNAL_ERROR',
          `Drive permission failed (${permissionResponse.status})`,
        );
      }

      return { webViewLink: uploaded.webViewLink };
    },
  };
}
