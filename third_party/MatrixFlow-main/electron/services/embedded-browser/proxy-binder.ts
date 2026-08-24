import { session } from 'electron';
import { getDatabase } from '../../data/Database';

export interface ProxyConfig {
  type: 'socks5' | 'http' | 'https';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export class ProxyBinder {
  async bind(accountId: string, partition: string): Promise<void> {
    const db = getDatabase();

    const row = db
      .prepare(`
        SELECT p.protocol, p.host, p.port, p.username, p.password
        FROM proxies p
        JOIN accounts a ON a.proxy_id = p.id
        WHERE a.id = ?
      `)
      .get(accountId) as
      | { protocol: string; host: string; port: number; username: string | null; password: string | null }
      | undefined;

    if (!row) {
      return;
    }

    const proxyType = row.protocol as ProxyConfig['type'];
    const userpass =
      row.username && row.password
        ? `${encodeURIComponent(row.username)}:${encodeURIComponent(row.password)}@`
        : '';

    let proxyRules: string;
    switch (proxyType) {
      case 'socks5':
        proxyRules = `socks5://${row.host}:${row.port}`;
        break;
      case 'https':
        proxyRules = `https://${userpass}${row.host}:${row.port}`;
        break;
      case 'http':
      default:
        proxyRules = `http://${userpass}${row.host}:${row.port}`;
        break;
    }

    const ses = session.fromPartition(partition);
    await ses.setProxy({ proxyRules });
  }
}