import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { AESCryptoService, CryptoError } from '@electron/core/CryptoService';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

function resetSingleton(): void {
  Reflect.set(AESCryptoService, 'instance', null);
}

describe('AESCryptoService', () => {
  let service: AESCryptoService;

  beforeEach(() => {
    vi.clearAllMocks();
    resetSingleton();
    service = AESCryptoService.getInstance();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  describe('getInstance', () => {
    it('返回同一个单例实例', () => {
      const a = AESCryptoService.getInstance();
      const b = AESCryptoService.getInstance();
      expect(a).toBe(b);
    });

    it('重置后返回新实例', () => {
      const first = AESCryptoService.getInstance();
      resetSingleton();
      const second = AESCryptoService.getInstance();
      expect(first).not.toBe(second);
    });
  });

  describe('initialize', () => {
    it('无密钥文件时创建新密钥并持久化', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await service.initialize();
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

      await service.initialize();
      expect(fs.readFileSync).toHaveBeenCalled();
    });

    it('幂等：重复调用不产生额外 I/O', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await service.initialize();
      vi.clearAllMocks();
      await service.initialize();
      expect(fs.readFileSync).not.toHaveBeenCalled();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('加载损坏密钥文件时抛出 CryptoError', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.alloc(2));

      await expect(service.initialize()).rejects.toThrow(CryptoError);
    });
  });

  describe('encrypt / decrypt', () => {
    beforeEach(async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await service.initialize();
    });

    it('字符串加密解密往返', async () => {
      const original = 'Hello, MatrixFlow!';
      const encrypted = await service.encrypt(original);
      const decrypted = await service.decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('Unicode 字符串往返', async () => {
      const original = '你好世界 🌍 emoji 🎉 日本語テスト';
      const encrypted = await service.encrypt(original);
      const decrypted = await service.decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('短字符串往返', async () => {
      const encrypted = await service.encrypt('a');
      const decrypted = await service.decrypt(encrypted);
      expect(decrypted).toBe('a');
    });

    it('长字符串往返', async () => {
      const original = 'x'.repeat(10000);
      const encrypted = await service.encrypt(original);
      const decrypted = await service.decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('输出为包含预期字段的合法 JSON', async () => {
      const encrypted = await service.encrypt('test');
      const payload = JSON.parse(encrypted);
      expect(payload).toHaveProperty('iv');
      expect(payload).toHaveProperty('authTag');
      expect(payload).toHaveProperty('ciphertext');
      expect(payload).toHaveProperty('salt');
      expect(payload).toHaveProperty('version', 1);
    });

    it('相同明文产生不同密文（随机 IV）', async () => {
      const e1 = await service.encrypt('same');
      const e2 = await service.encrypt('same');
      expect(e1).not.toBe(e2);
    });
  });

  describe('encryptObject / decryptObject', () => {
    beforeEach(async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await service.initialize();
    });

    it('对象往返', async () => {
      const original = { name: 'test', count: 42, nested: { key: 'value' } };
      const encrypted = await service.encryptObject(original);
      const decrypted = await service.decryptObject<typeof original>(encrypted);
      expect(decrypted).toEqual(original);
    });

    it('数组往返', async () => {
      const original = [1, 'two', { three: 3 }, true, null];
      const encrypted = await service.encryptObject(original);
      const decrypted = await service.decryptObject<typeof original>(encrypted);
      expect(decrypted).toEqual(original);
    });

    it('嵌套复杂对象往返', async () => {
      const original = {
        users: [
          { id: 1, name: 'Alice', tags: ['admin', 'user'] },
          { id: 2, name: 'Bob', tags: [] },
        ],
        meta: { total: 2, page: 1 },
      };
      const encrypted = await service.encryptObject(original);
      const decrypted = await service.decryptObject<typeof original>(encrypted);
      expect(decrypted).toEqual(original);
    });
  });

  describe('deriveKey', () => {
    it('初始化后返回 32 字节 Buffer', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await service.initialize();
      const key = await service.deriveKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('多次调用返回相同密钥', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await service.initialize();
      const key1 = await service.deriveKey();
      const key2 = await service.deriveKey();
      expect(key1.equals(key2)).toBe(true);
    });
  });

  describe('错误处理', () => {
    it('未初始化时 encrypt 抛出 CryptoError', async () => {
      await expect(service.encrypt('test')).rejects.toThrow(CryptoError);
      await expect(service.encrypt('test')).rejects.toThrow(
        'CryptoService 未初始化',
      );
    });

    it('未初始化时 decrypt 抛出 CryptoError', async () => {
      await expect(service.decrypt('{}')).rejects.toThrow(CryptoError);
      await expect(service.decrypt('{}')).rejects.toThrow(
        'CryptoService 未初始化',
      );
    });

    it('decrypt 非 JSON 字符串抛出 CryptoError', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await service.initialize();
      await expect(service.decrypt('not-json')).rejects.toThrow(CryptoError);
      await expect(service.decrypt('not-json')).rejects.toThrow('无效的数据格式');
    });

    it('decrypt 缺失字段抛出 CryptoError', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await service.initialize();
      await expect(service.decrypt('{}')).rejects.toThrow(CryptoError);
      await expect(service.decrypt('{}')).rejects.toThrow('字段不完整');
    });

    it('decrypt 版本不匹配抛出 CryptoError', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await service.initialize();
      const payload = JSON.stringify({
        iv: Buffer.alloc(12).toString('base64'),
        authTag: Buffer.alloc(16).toString('base64'),
        ciphertext: Buffer.alloc(8).toString('base64'),
        salt: Buffer.alloc(32).toString('base64'),
        version: 999,
      });
      await expect(service.decrypt(payload)).rejects.toThrow(CryptoError);
      await expect(service.decrypt(payload)).rejects.toThrow('版本不匹配');
    });

    it('decrypt 被篡改的密文抛出 CryptoError', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await service.initialize();
      const encrypted = await service.encrypt('secret data');
      const payload = JSON.parse(encrypted);
      payload.ciphertext = Buffer.from('tampered').toString('base64');
      await expect(service.decrypt(JSON.stringify(payload))).rejects.toThrow(
        CryptoError,
      );
      await expect(service.decrypt(JSON.stringify(payload))).rejects.toThrow(
        '篡改',
      );
    });

    it('用不同密钥解密抛出 CryptoError', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await service.initialize();
      const encrypted = await service.encrypt('secret');

      resetSingleton();
      const service2 = AESCryptoService.getInstance();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await service2.initialize();

      await expect(service2.decrypt(encrypted)).rejects.toThrow(CryptoError);
    });
  });

  describe('CryptoError', () => {
    it('name 属性为 CryptoError', () => {
      const err = new CryptoError('test');
      expect(err.name).toBe('CryptoError');
    });

    it('message 正确传递', () => {
      const err = new CryptoError('自定义消息');
      expect(err.message).toBe('自定义消息');
    });

    it('cause 属性可选保留原始错误', () => {
      const cause = new Error('root cause');
      const err = new CryptoError('wrapper', cause);
      expect(err.cause).toBe(cause);
    });

    it('无 cause 时 cause 为 undefined', () => {
      const err = new CryptoError('no cause');
      expect(err.cause).toBeUndefined();
    });

    it('是 Error 的实例', () => {
      const err = new CryptoError('test');
      expect(err).toBeInstanceOf(Error);
    });
  });
});
