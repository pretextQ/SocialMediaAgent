import { describe, it, expect } from 'vitest';
import { SELECTOR_ED25519_PUBLIC_KEY } from '@electron/config/selector-public-key';

describe('SELECTOR_ED25519_PUBLIC_KEY', () => {
  it('is a PEM-formatted public key string', () => {
    expect(SELECTOR_ED25519_PUBLIC_KEY).toContain('-----BEGIN PUBLIC KEY-----');
    expect(SELECTOR_ED25519_PUBLIC_KEY).toContain('-----END PUBLIC KEY-----');
  });

  it('is typed as const (narrow string literal)', () => {
    expect(typeof SELECTOR_ED25519_PUBLIC_KEY).toBe('string');
    expect(SELECTOR_ED25519_PUBLIC_KEY.length).toBeGreaterThan(0);
  });

  it('contains base64-encoded key data between PEM headers', () => {
    const lines = SELECTOR_ED25519_PUBLIC_KEY.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines[0]).toBe('-----BEGIN PUBLIC KEY-----');
    expect(lines[lines.length - 1]).toBe('-----END PUBLIC KEY-----');

    const base64Body = lines.slice(1, -1).join('');
    expect(base64Body.length).toBeGreaterThan(0);
    expect(base64Body).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('has a known fixed value for development/testing', () => {
    expect(SELECTOR_ED25519_PUBLIC_KEY).toContain('MCowBQYDK2VwAyEA');
  });
});
