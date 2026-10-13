import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRegistrarContact } from './contact';

afterEach(() => vi.unstubAllEnvs());

describe('getRegistrarContact', () => {
  it('returns null when unset', () => {
    vi.stubEnv('VITE_REGISTRAR_CONTACT', '');
    expect(getRegistrarContact()).toBeNull();
  });

  it('builds a t.me link from a handle', () => {
    vi.stubEnv('VITE_REGISTRAR_CONTACT', '@thd_registrar');
    expect(getRegistrarContact()).toEqual({
      label: '@thd_registrar',
      href: 'https://t.me/thd_registrar',
    });
  });

  it('passes through a non-handle value verbatim', () => {
    vi.stubEnv('VITE_REGISTRAR_CONTACT', 'mailto:registrar@thd.example');
    expect(getRegistrarContact()).toEqual({
      label: 'mailto:registrar@thd.example',
      href: 'mailto:registrar@thd.example',
    });
  });
});
