import { Logger } from '../core/Logger';
import { getDatabase, isDatabaseAvailable } from '../data/Database';
import type { Proxy, AccountBinding } from '../data/types';
import { randomUUID } from 'crypto';
import http from 'http';
import https from 'https';
import { createRequire } from 'module';

const req = createRequire(__filename);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SocksProxyAgent = req('socks-proxy-agent').SocksProxyAgent;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const HttpsProxyAgent = req('https-proxy-agent').HttpsProxyAgent;

const logger = new Logger('ProxyService');

interface CreateProxyData {
  name: string;
  protocol: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
}

interface UpdateProxyData {
  name?: string;
  protocol?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  status?: string;
}

interface CheckResult {
  success: boolean;
  message: string;
  latency?: number;
}

class ProxyService {
  private static instance: ProxyService;

  private constructor() {}

  static getInstance(): ProxyService {
    if (!ProxyService.instance) {
      ProxyService.instance = new ProxyService();
    }
    return ProxyService.instance;
  }

  async getAllProxies(): Promise<Proxy[]> {
    if (!isDatabaseAvailable()) {
      logger.warn('数据库不可用');
      return [];
    }

    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM proxies ORDER BY created_at DESC
    `).all() as Proxy[];

    return rows;
  }

  async getProxyById(id: string): Promise<Proxy | null> {
    if (!isDatabaseAvailable()) {
      return null;
    }

    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM proxies WHERE id = ?
    `).get(id) as Proxy | undefined;

    return row || null;
  }

  async createProxy(data: CreateProxyData): Promise<Proxy> {
    if (!isDatabaseAvailable()) {
      throw new Error('数据库不可用');
    }

    const db = getDatabase();
    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO proxies (id, name, protocol, host, port, username, password, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      id,
      data.name,
      data.protocol,
      data.host,
      data.port,
      data.username || null,
      data.password || null,
      now,
      now
    );

    const proxy = await this.getProxyById(id);
    if (!proxy) {
      throw new Error('创建代理失败');
    }

    logger.info(`创建代理: ${data.name}`);
    return proxy;
  }

  async updateProxy(id: string, data: UpdateProxyData): Promise<Proxy> {
    if (!isDatabaseAvailable()) {
      throw new Error('数据库不可用');
    }

    const existing = await this.getProxyById(id);
    if (!existing) {
      throw new Error('代理不存在');
    }

    const db = getDatabase();
    const now = new Date().toISOString();

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.protocol !== undefined) {
      updates.push('protocol = ?');
      values.push(data.protocol);
    }
    if (data.host !== undefined) {
      updates.push('host = ?');
      values.push(data.host);
    }
    if (data.port !== undefined) {
      updates.push('port = ?');
      values.push(data.port);
    }
    if (data.username !== undefined) {
      updates.push('username = ?');
      values.push(data.username);
    }
    if (data.password !== undefined) {
      updates.push('password = ?');
      values.push(data.password);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      values.push(now);
      values.push(id);

      db.prepare(`
        UPDATE proxies SET ${updates.join(', ')} WHERE id = ?
      `).run(...values);
    }

    const proxy = await this.getProxyById(id);
    if (!proxy) {
      throw new Error('更新代理失败');
    }

    logger.info(`更新代理: ${id}`);
    return proxy;
  }

  async deleteProxy(id: string): Promise<void> {
    if (!isDatabaseAvailable()) {
      throw new Error('数据库不可用');
    }

    const db = getDatabase();
    db.prepare('DELETE FROM proxies WHERE id = ?').run(id);
    logger.info(`删除代理: ${id}`);
  }

  async checkProxy(id: string): Promise<CheckResult> {
    const proxy = await this.getProxyById(id);
    if (!proxy) {
      return { success: false, message: '代理不存在' };
    }

    const startTime = Date.now();
    const proxyUrl = this.buildProxyUrl(proxy);
    const TIMEOUT = 30000;

    try {
      let agent: http.Agent;

      if (proxy.protocol === 'socks5') {
        agent = new SocksProxyAgent(proxyUrl) as http.Agent;
      } else {
        agent = new HttpsProxyAgent(proxyUrl) as http.Agent;
      }

      const testUrls = [
        'http://ip-api.com/json',
        'http://httpbin.org/ip',
      ];

      let lastError: Error | null = null;

      for (const testUrl of testUrls) {
        try {
          const isHttps = testUrl.startsWith('https://');
          const client = isHttps ? https : http;

          const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
            const req = client.get(testUrl, {
              agent,
              timeout: TIMEOUT,
            }, (res: http.IncomingMessage) => {
              resolve(res);
            });

            req.on('error', reject);
            req.on('timeout', () => {
              req.destroy();
              reject(new Error('请求超时'));
            });
          });

          if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) {
            throw new Error(`HTTP ${response.statusCode}`);
          }

          await new Promise<void>((resolve, reject) => {
            response.on('data', () => {});
            response.on('end', resolve);
            response.on('error', reject);
          });

          const latency = Date.now() - startTime;
          await this.updateProxyCheckResult(id, 'active', `连接成功，延迟 ${latency}ms`);

          return { success: true, message: `连接成功，延迟 ${latency}ms`, latency };
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }

      const errorMsg = lastError?.message || '未知错误';
      await this.updateProxyCheckResult(id, 'inactive', `连接失败: ${errorMsg}`);

      return { success: false, message: `连接失败: ${errorMsg}` };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.updateProxyCheckResult(id, 'inactive', `连接失败: ${errorMsg}`);

      return { success: false, message: `连接失败: ${errorMsg}` };
    }
  }

  private buildProxyUrl(proxy: Proxy): string {
    const auth = proxy.username
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password || '')}@`
      : '';
    return `${proxy.protocol}://${auth}${proxy.host}:${proxy.port}`;
  }

  private async updateProxyCheckResult(id: string, status: string, result: string): Promise<void> {
    if (!isDatabaseAvailable()) return;

    const db = getDatabase();
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE proxies 
      SET status = ?, last_check_at = ?, last_check_result = ?, updated_at = ?
      WHERE id = ?
    `).run(status, now, result, now, id);
  }

  async getActiveProxies(): Promise<Proxy[]> {
    if (!isDatabaseAvailable()) {
      return [];
    }

    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM proxies WHERE status = 'active' ORDER BY created_at DESC
    `).all() as Proxy[];

    return rows;
  }

  async batchCheck(ids: string[]): Promise<{ total: number; completed: number; results: Map<string, CheckResult> }> {
    const results = new Map<string, CheckResult>();
    let completed = 0;
    const CONCURRENCY = 5;

    const check = async (id: string): Promise<void> => {
      const result = await this.checkProxy(id);
      results.set(id, result);
      completed++;
    };

    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      chunks.push(ids.slice(i, i + CONCURRENCY));
    }

    for (const chunk of chunks) {
      await Promise.all(chunk.map(id => check(id)));
    }

    return { total: ids.length, completed, results };
  }

  async importProxies(
    content: string,
    format: 'csv' | 'txt'
  ): Promise<{ total: number; success: number; failed: number; errors: Array<{ line: number; reason: string }> }> {
    const errors: Array<{ line: number; reason: string }> = [];
    let success = 0;

    const lines = content.split('\n').filter(line => line.trim());

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      try {
        let name: string;
        let proxyUrl: string;

        if (format === 'csv') {
          const parts = line.split(',');
          if (parts.length < 2) {
            errors.push({ line: lineNumber, reason: '格式错误：需要 名称,代理地址' });
            continue;
          }
          name = parts[0].trim();
          proxyUrl = parts.slice(1).join(',').trim();
        } else {
          const parts = line.split(',');
          if (parts.length < 2) {
            errors.push({ line: lineNumber, reason: '格式错误：需要 名称,代理地址' });
            continue;
          }
          name = parts[0].trim();
          proxyUrl = parts.slice(1).join(',').trim();
        }

        const parsed = this.parseProxyUrl(proxyUrl);
        if (!parsed) {
          errors.push({ line: lineNumber, reason: '无效的代理地址格式' });
          continue;
        }

        await this.createProxy({
          name,
          protocol: parsed.protocol,
          host: parsed.host,
          port: parsed.port,
          username: parsed.username,
          password: parsed.password,
        });
        success++;
      } catch (e) {
        errors.push({ line: lineNumber, reason: String(e) });
      }
    }

    return { total: lines.length, success, failed: errors.length, errors };
  }

  async exportProxies(scope: 'all' | 'available' | 'selected', ids?: string[]): Promise<string> {
    let proxies: Proxy[];

    if (scope === 'all') {
      proxies = await this.getAllProxies();
    } else if (scope === 'available') {
      proxies = await this.getActiveProxies();
    } else if (scope === 'selected' && ids) {
      const db = getDatabase();
      proxies = ids.map(id => db.prepare('SELECT * FROM proxies WHERE id = ?').get(id) as Proxy).filter(Boolean);
    } else {
      proxies = [];
    }

    return proxies.map(p => {
      const creds = p.username && p.password ? `${p.username}:${p.password}@` : '';
      return `${p.name},${p.protocol}://${creds}${p.host}:${p.port}`;
    }).join('\n');
  }

  async getBoundAccounts(proxyId: string): Promise<AccountBinding[]> {
    if (!isDatabaseAvailable()) {
      return [];
    }

    const db = getDatabase();
    const rows = db.prepare(`
      SELECT a.id as accountId, a.nickname as accountName, a.avatar_url as accountAvatar,
             a.platform, a.status, g.name as groupName, a.updated_at as boundAt
      FROM accounts a
      LEFT JOIN groups g ON a.group_id = g.id
      WHERE a.proxy_id = ?
      ORDER BY a.updated_at DESC
    `).all(proxyId) as Array<{
      accountId: string;
      accountName: string;
      accountAvatar: string | null;
      platform: string;
      status: string;
      groupName: string | null;
      boundAt: string;
    }>;

    return rows.map(row => ({
      accountId: row.accountId,
      accountName: row.accountName || '未知账号',
      accountAvatar: row.accountAvatar || undefined,
      platform: row.platform,
      isShared: row.status === 'shared',
      groupName: row.groupName || undefined,
      boundAt: row.boundAt,
    }));
  }

  async setAccounts(proxyId: string, accountIds: string[]): Promise<void> {
    if (!isDatabaseAvailable()) {
      throw new Error('数据库不可用');
    }

    const db = getDatabase();
    const now = new Date().toISOString();

    db.prepare('UPDATE accounts SET proxy_id = NULL, updated_at = ? WHERE proxy_id = ?').run(now, proxyId);

    if (accountIds.length > 0) {
      const placeholders = accountIds.map(() => '?').join(',');
      db.prepare(`UPDATE accounts SET proxy_id = ?, updated_at = ? WHERE id IN (${placeholders})`).run(proxyId, now, ...accountIds);
    }
  }

  async unbindAccount(proxyId: string, accountId: string): Promise<void> {
    if (!isDatabaseAvailable()) {
      throw new Error('数据库不可用');
    }

    const db = getDatabase();
    const now = new Date().toISOString();

    db.prepare('UPDATE accounts SET proxy_id = NULL, updated_at = ? WHERE id = ? AND proxy_id = ?').run(now, accountId, proxyId);
  }

  private parseProxyUrl(url: string): { protocol: string; host: string; port: number; username?: string; password?: string } | null {
    const match = url.match(/^(socks5|https?|http):\/\/(?:(.+):(.+)@)?(.+):(\d+)$/);
    if (!match) return null;

    return {
      protocol: match[1] || 'http',
      username: match[2] ? decodeURIComponent(match[2]) : undefined,
      password: match[3] ? decodeURIComponent(match[3]) : undefined,
      host: match[4],
      port: parseInt(match[5], 10),
    };
  }
}

export const proxyService = ProxyService.getInstance();
