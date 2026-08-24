import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { Page } from 'patchright';
import { DebugRecorder, redactPII, createDebugRecorder } from '../../../../electron/platform/base/DebugRecorder';

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-matrixflow'),
  },
}));

// Mock cryptoService
const mockCrypto = {
  encrypt: vi.fn((data: string) => Promise.resolve(`encrypted:${data}`)),
  decrypt: vi.fn((encrypted: string) => Promise.resolve(encrypted.replace('encrypted:', ''))),
};

describe('DebugRecorder', () => {
  const tempDir = `/tmp/test-matrixflow-debugrecorder-${Date.now()}`;

  const defaultOptions = {
    enabled: true,
    retentionDays: 7,
    encrypt: true,
    redactPII: true,
    storagePath: tempDir,
  };

  beforeEach(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('recordStep', () => {
    it('should return fn result directly when enabled=false', async () => {
      const recorder = new DebugRecorder({ ...defaultOptions, enabled: false });
      const result = await recorder.recordStep('test-step', async () => 42);
      expect(result).toBe(42);
    });

    it('should wrap successful fn and return result', async () => {
      const recorder = new DebugRecorder({ ...defaultOptions, enabled: true }, mockCrypto as any);
      const result = await recorder.recordStep('test-step', async () => 'success');
      expect(result).toBe('success');
    });

    it('should throw when fn throws', async () => {
      const recorder = new DebugRecorder({ ...defaultOptions, enabled: true }, mockCrypto as any);
      await expect(
        recorder.recordStep('failing-step', async () => {
          throw new Error('test error');
        }),
      ).rejects.toThrow('test error');
    });

    it('should persist step to steps.json after fn completes', async () => {
      const recorder = new DebugRecorder({ ...defaultOptions, enabled: true }, mockCrypto as any);
      await recorder.recordStep('test-step', async () => 42);
      const stepsFile = path.join(tempDir, recorder.getSessionId(), 'steps.json');
      expect(fs.existsSync(stepsFile)).toBe(true);
      const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf-8'));
      expect(steps).toHaveLength(1);
      expect(steps[0].name).toBe('test-step');
      expect(steps[0].status).toBe('done');
    });

    it('should record durationMs on success', async () => {
      const recorder = new DebugRecorder({ ...defaultOptions, enabled: true }, mockCrypto as any);
      await recorder.recordStep('timed-step', async () => {
        await new Promise((r) => setTimeout(r, 20));
        return 'done';
      });
      const stepsFile = path.join(tempDir, recorder.getSessionId(), 'steps.json');
      const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf-8'));
      expect(steps[0].durationMs).toBeGreaterThanOrEqual(20);
    });

    it('should set status=failed and record error when fn throws', async () => {
      const recorder = new DebugRecorder({ ...defaultOptions, enabled: true }, mockCrypto as any);
      try {
        await recorder.recordStep('failing-step', async () => {
          throw new Error('boom');
        });
      } catch {}
      const stepsFile = path.join(tempDir, recorder.getSessionId(), 'steps.json');
      const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf-8'));
      expect(steps[0].status).toBe('failed');
      expect(steps[0].error).toBe('boom');
    });

    it('should set status=done when fn succeeds', async () => {
      const recorder = new DebugRecorder({ ...defaultOptions, enabled: true }, mockCrypto as any);
      await recorder.recordStep('ok-step', async () => 42);
      const stepsFile = path.join(tempDir, recorder.getSessionId(), 'steps.json');
      const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf-8'));
      expect(steps[0].status).toBe('done');
    });
  });

  describe('snapshot', () => {
    it('should return empty snapshot when enabled=false', async () => {
      const recorder = new DebugRecorder({ ...defaultOptions, enabled: false });
      const mockPage = { url: () => 'http://test.com', title: () => 'Test' } as any;
      const snap = await recorder.snapshot('manual-snap', mockPage);
      expect(snap.screenshotPath).toBe('');
      expect(snap.url).toBe('http://test.com');
    });
  });

  describe('cleanup', () => {
    it('should return 0 when directory does not exist', async () => {
      const recorder = new DebugRecorder({ ...defaultOptions, storagePath: '/tmp/nonexistent' });
      const count = await recorder.cleanup();
      expect(count).toBe(0);
    });

    it('should delete sessions older than retentionDays', async () => {
      const oldSession = path.join(tempDir, `session_old`);
      fs.mkdirSync(oldSession, { recursive: true });
      fs.writeFileSync(path.join(oldSession, 'steps.json'), '[]');
      const oldTime = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      fs.utimesSync(oldSession, oldTime, oldTime);

      const recorder = new DebugRecorder({ ...defaultOptions, enabled: true, retentionDays: 7 });
      const deleted = await recorder.cleanup();
      expect(deleted).toBe(1);
      expect(fs.existsSync(oldSession)).toBe(false);
    });

    it('should keep sessions newer than retentionDays', async () => {
      const recentSession = path.join(tempDir, `session_recent_${Date.now()}`);
      fs.mkdirSync(recentSession, { recursive: true });
      fs.writeFileSync(path.join(recentSession, 'steps.json'), '[]');

      const recorder = new DebugRecorder({ ...defaultOptions, enabled: true, retentionDays: 7 });
      const deleted = await recorder.cleanup();
      expect(deleted).toBe(0);
      expect(fs.existsSync(recentSession)).toBe(true);
    });
  });

  describe('toJSON', () => {
    it('should return empty array initially', () => {
      const recorder = new DebugRecorder(defaultOptions);
      expect(recorder.toJSON()).toEqual([]);
    });
  });

  describe('setSessionId / getSessionId', () => {
    it('should allow setting and getting session ID', () => {
      const recorder = new DebugRecorder(defaultOptions);
      recorder.setSessionId('custom-session-id');
      expect(recorder.getSessionId()).toBe('custom-session-id');
    });
  });
});

describe('redactPII', () => {
  it('should redact phone numbers', () => {
    const result = redactPII('Contact: 13812345678');
    expect(result).toContain('1****');
    expect(result).not.toContain('13812345678');
  });

  it('should redact account IDs', () => {
    const result = redactPII('account_id_abcdefgh is your account');
    expect(result).toContain('account_***');
    expect(result).not.toContain('abcdefgh');
  });

  it('should redact emails', () => {
    const result = redactPII('Email: user@example.com');
    expect(result).toContain('u***@example.com');
    expect(result).not.toContain('user@');
  });

  it('should truncate long cookie text', () => {
    const longText = 'x'.repeat(300);
    const result = redactPII(longText);
    expect(result.length).toBeLessThan(300);
    expect(result).toContain('[REDACTED]');
  });

  it('should return original text when no PII matches', () => {
    const result = redactPII('Hello world this is safe text');
    expect(result).toBe('Hello world this is safe text');
  });

  it('should handle multiple phone numbers', () => {
    const result = redactPII('Phone1: 13812345678 Phone2: 13998765432');
    expect(result).toContain('1****');
    expect(result).toContain('1****');
    expect(result).not.toContain('13812345678');
    expect(result).not.toContain('13998765432');
  });
});
