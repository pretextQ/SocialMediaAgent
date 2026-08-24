import * as path from 'path';
import * as fs from 'fs';
import type { Page } from 'patchright';

export const TEST_ACCOUNT = 'test_account';
export const TEST_VIDEO = path.resolve(process.cwd(), 'test-video.mp4');
export const TEST_DATA_DIR = path.resolve(process.cwd(), 'data', 'test');
export const TEST_COOKIE_DIR = path.join(TEST_DATA_DIR, 'cookies', 'douyin');
export const TEST_QR_DIR = path.join(TEST_DATA_DIR, 'qrcodes', 'douyin');
export const DEV_SERVER_URL = process.env.DEV_SERVER_URL || 'http://localhost:5173';
export const E2E_TIMEOUT = parseInt(process.env.E2E_TIMEOUT || '30000', 10);

export function ensureTestDirs(): void {
  [TEST_COOKIE_DIR, TEST_QR_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

export function cleanupTestData(): void {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
}

export function cookiePathFor(accountId: string): string {
  return path.join(TEST_COOKIE_DIR, `${accountId}.json`);
}

export function formatResult(label: string, result: Record<string, unknown>): string {
  return `\n[${label}]\n${JSON.stringify(result, null, 2)}\n`;
}

export function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

export async function waitForAppReady(page: Page, timeout = 10000): Promise<boolean> {
  try {
    await page.waitForSelector('.app-ready, #app, .sidebar', { timeout });
    return true;
  } catch {
    return false;
  }
}

export async function clearLocalStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

export async function setMockSettings(page: Page, settings: Record<string, unknown>): Promise<void> {
  await page.evaluate((s) => {
    localStorage.setItem('matrixflow_settings', JSON.stringify(s));
  }, settings);
}

export async function getLocalStorage(page: Page, key: string): Promise<unknown> {
  return page.evaluate((k) => {
    const value = localStorage.getItem(k);
    return value ? JSON.parse(value) : null;
  }, key);
}
