import { generateKeyPairSync } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../utils/errors';
import { createDriveService } from './drive.service';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const serviceAccountJson = JSON.stringify({
  client_email: 'svc@project.iam.gserviceaccount.com',
  private_key: privateKey,
});

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

describe('createDriveService', () => {
  it('is not configured without a service account', () => {
    const drive = createDriveService({ serviceAccountJson: null, folderId: 'folder' });
    expect(drive.isConfigured).toBe(false);
  });

  it('throws INTERNAL_ERROR when uploadFile is called while unconfigured', async () => {
    const drive = createDriveService({ serviceAccountJson: null, folderId: 'folder' });
    await expect(
      drive.uploadFile(
        { stream: Readable.from([Buffer.from('x')]) },
        { mimeType: 'application/pdf', name: 'x.pdf' },
      ),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('runs the resumable upload flow and returns the web view link', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      calls.push({ url: href, init });
      if (href === 'https://oauth2.googleapis.com/token') {
        return jsonResponse({ access_token: 'token-123', expires_in: 3600 });
      }
      if (href.includes('uploadType=resumable')) {
        return new Response(null, {
          status: 200,
          headers: { location: 'https://upload.example/session-abc' },
        });
      }
      if (href === 'https://upload.example/session-abc') {
        return jsonResponse({ id: 'file-1', webViewLink: 'https://drive.google.com/file/d/file-1/view' });
      }
      if (href.includes('permissions')) {
        return jsonResponse({ id: 'perm-1' });
      }
      throw new Error(`unexpected fetch: ${href}`);
    });

    const drive = createDriveService({
      serviceAccountJson,
      folderId: 'folder-abc',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(drive.isConfigured).toBe(true);

    const result = await drive.uploadFile(
      { stream: Readable.from([Buffer.from('hello')]), byteLength: 5 },
      { mimeType: 'application/pdf', name: 'grace.pdf' },
    );

    expect(result.webViewLink).toBe('https://drive.google.com/file/d/file-1/view');

    const createCall = calls.find((call) => call.url.includes('uploadType=resumable'));
    expect(createCall?.url).toContain('supportsAllDrives=true');
    expect(createCall?.url).toContain('fields=id,webViewLink');
    const createBody = JSON.parse(String(createCall?.init?.body));
    expect(createBody.name).toBe('grace.pdf');
    expect(createBody.parents).toEqual(['folder-abc']);
    expect(createBody.copyRequiresWriterPermission).toBe(true);

    const permCall = calls.find((call) => call.url.includes('permissions'));
    expect(JSON.parse(String(permCall?.init?.body))).toEqual({ role: 'reader', type: 'anyone' });
  });
});
