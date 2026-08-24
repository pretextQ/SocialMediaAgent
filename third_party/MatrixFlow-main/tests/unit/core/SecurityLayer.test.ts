import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { SecurityLayer, SecurityError } from '@electron/core/SecurityLayer';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(() => ({ dev: 123, ino: 456 })),
}));

function resetSingleton(): void {
  Reflect.set(SecurityLayer, 'instance', null);
}

describe('SecurityLayer', () => {
  let layer: SecurityLayer;

  beforeEach(() => {
    vi.clearAllMocks();
    resetSingleton();
    layer = SecurityLayer.getInstance();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  describe('getInstance', () => {
    it('返回同一个单例实例', () => {
      const a = SecurityLayer.getInstance();
      const b = SecurityLayer.getInstance();
      expect(a).toBe(b);
    });

    it('重置后返回新实例', () => {
      const first = SecurityLayer.getInstance();
      resetSingleton();
      const second = SecurityLayer.getInstance();
      expect(first).not.toBe(second);
    });
  });

  describe('initialize', () => {
    it('无密钥文件时派生新密钥并持久化', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await layer.initialize();
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('有密钥文件时从文件加载密钥', async () => {
      const salt = crypto.randomBytes(32);
      const key = crypto.randomBytes(32);
      const saltLenBuf = Buffer.alloc(4);
      saltLenBuf.writeUInt32BE(salt.length, 0);
      const keyFileData = Buffer.concat([saltLenBuf, salt, key]);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(keyFileData);

      await layer.initialize();
      expect(fs.readFileSync).toHaveBeenCalled();
    });

    it('加载失败时回退到派生新密钥', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('corrupt');
      });

      await layer.initialize();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('幂等：重复调用不产生额外 I/O', async () => {
      await layer.initialize();
      vi.clearAllMocks();
      await layer.initialize();
      expect(fs.readFileSync).not.toHaveBeenCalled();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('encrypt / decrypt', () => {
    beforeEach(async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await layer.initialize();
    });

    it('字符串加密解密往返', async () => {
      const original = 'Hello, SecurityLayer!';
      const encrypted = await layer.encrypt(original);
      const decrypted = await layer.decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('Unicode 字符串往返', async () => {
      const original = '安全数据 🔐 保护隐私';
      const encrypted = await layer.encrypt(original);
      const decrypted = await layer.decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('短字符串往返', async () => {
      const encrypted = await layer.encrypt('a');
      const decrypted = await layer.decrypt(encrypted);
      expect(decrypted).toBe('a');
    });

    it('长字符串往返', async () => {
      const original = 'A'.repeat(50000);
      const encrypted = await layer.encrypt(original);
      const decrypted = await layer.decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('输出为包含预期字段的合法 JSON', async () => {
      const encrypted = await layer.encrypt('test');
      const payload = JSON.parse(encrypted);
      expect(payload).toHaveProperty('iv');
      expect(payload).toHaveProperty('authTag');
      expect(payload).toHaveProperty('ciphertext');
      expect(payload).toHaveProperty('version', 1);
    });

    it('相同明文产生不同密文（随机 IV）', async () => {
      const e1 = await layer.encrypt('same');
      const e2 = await layer.encrypt('same');
      expect(e1).not.toBe(e2);
    });
  });

  describe('encryptObject / decryptObject', () => {
    beforeEach(async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await layer.initialize();
    });

    it('对象往返', async () => {
      const original = { token: 'abc123', expires: 9999999 };
      const encrypted = await layer.encryptObject(original);
      const decrypted = await layer.decryptObject<typeof original>(encrypted);
      expect(decrypted).toEqual(original);
    });

    it('包含 null 和布尔值的对象往返', async () => {
      const original = { a: null, b: true, c: false, d: 0 };
      const encrypted = await layer.encryptObject(original);
      const decrypted = await layer.decryptObject<typeof original>(encrypted);
      expect(decrypted).toEqual(original);
    });
  });

  describe('错误处理', () => {
    it('未初始化时 encrypt 抛出 SecurityError', async () => {
      await expect(layer.encrypt('test')).rejects.toThrow(SecurityError);
      await expect(layer.encrypt('test')).rejects.toThrow('安全层未初始化');
    });

    it('未初始化时 decrypt 抛出 SecurityError', async () => {
      await expect(layer.decrypt('{}')).rejects.toThrow(SecurityError);
    });

    it('decrypt 非 JSON 字符串抛出 SecurityError', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await layer.initialize();
      await expect(layer.decrypt('not-json')).rejects.toThrow(SecurityError);
      await expect(layer.decrypt('not-json')).rejects.toThrow(
        '无效的加密数据格式',
      );
    });

    it('decrypt 缺失字段抛出 SecurityError', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await layer.initialize();
      await expect(layer.decrypt('{"iv":"a"}')).rejects.toThrow(SecurityError);
      await expect(layer.decrypt('{"iv":"a"}')).rejects.toThrow('字段不完整');
    });

    it('decrypt 版本不匹配抛出 SecurityError', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await layer.initialize();
      const payload = JSON.stringify({
        iv: Buffer.alloc(12).toString('base64'),
        authTag: Buffer.alloc(16).toString('base64'),
        ciphertext: Buffer.alloc(8).toString('base64'),
        version: 999,
      });
      await expect(layer.decrypt(payload)).rejects.toThrow(SecurityError);
      await expect(layer.decrypt(payload)).rejects.toThrow('版本不匹配');
    });

    it('decrypt 被篡改的密文抛出 SecurityError', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await layer.initialize();
      const encrypted = await layer.encrypt('secret');
      const payload = JSON.parse(encrypted);
      payload.ciphertext = Buffer.from('tampered').toString('base64');
      await expect(layer.decrypt(JSON.stringify(payload))).rejects.toThrow(
        SecurityError,
      );
      await expect(layer.decrypt(JSON.stringify(payload))).rejects.toThrow(
        '篡改',
      );
    });

    it('用不同密钥解密抛出 SecurityError', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await layer.initialize();
      const encrypted = await layer.encrypt('secret');

      resetSingleton();
      const layer2 = SecurityLayer.getInstance();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await layer2.initialize();

      await expect(layer2.decrypt(encrypted)).rejects.toThrow(SecurityError);
    });
  });

  describe('SecurityError', () => {
    it('name 属性为 SecurityError', () => {
      const err = new SecurityError('test');
      expect(err.name).toBe('SecurityError');
    });

    it('message 正确传递', () => {
      const err = new SecurityError('自定义消息');
      expect(err.message).toBe('自定义消息');
    });

    it('cause 属性可选保留原始错误', () => {
      const cause = new Error('root cause');
      const err = new SecurityError('wrapper', cause);
      expect(err.cause).toBe(cause);
    });

    it('无 cause 时 cause 为 undefined', () => {
      const err = new SecurityError('no cause');
      expect(err.cause).toBeUndefined();
    });

    it('是 Error 的实例', () => {
      const err = new SecurityError('test');
      expect(err).toBeInstanceOf(Error);
    });
  });
});
