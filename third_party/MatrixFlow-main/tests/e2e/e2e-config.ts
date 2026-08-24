export interface E2EConfig {
  mockAccountLogin: boolean;
  mockPlatform: 'douyin' | 'xiaohongshu' | 'channels' | 'kuaishou' | 'bilibili';
  headless: boolean;
  viewport: { width: number; height: number };
  devServerUrl: string;
  timeout: number;
}

export const defaultE2EConfig: E2EConfig = {
  mockAccountLogin: true,
  mockPlatform: 'douyin',
  headless: false,
  viewport: { width: 1280, height: 800 },
  devServerUrl: 'http://localhost:5173',
  timeout: 30000,
};

export function createE2EConfig(overrides: Partial<E2EConfig> = {}): E2EConfig {
  return { ...defaultE2EConfig, ...overrides };
}
