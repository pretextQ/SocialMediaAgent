import type { Platform, LoginLock, DuplicateLoginDecision } from './types';

export class LoginLockManager {
  private static instance: LoginLockManager;
  private currentLock: LoginLock | null = null;
  private queue: Array<() => void> = [];
  private onLoginBlocked?: (data: { reason: string; currentPlatform?: Platform; elapsed: number }) => void;
  private onLoginQueued?: (data: { platform: Platform; queuePosition: number }) => void;

  private constructor() {}

  static getInstance(): LoginLockManager {
    if (!LoginLockManager.instance) {
      LoginLockManager.instance = new LoginLockManager();
    }
    return LoginLockManager.instance;
  }

  setCallbacks(
    onLoginBlocked?: (data: { reason: string; currentPlatform?: Platform; elapsed: number }) => void,
    onLoginQueued?: (data: { platform: Platform; queuePosition: number }) => void
  ): void {
    this.onLoginBlocked = onLoginBlocked;
    this.onLoginQueued = onLoginQueued;
  }

  async acquire(platform: Platform): Promise<() => void> {
    if (!this.currentLock) {
      this.currentLock = { platform, acquiredAt: Date.now() };
      return () => this.release();
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.currentLock = { platform, acquiredAt: Date.now() };
        resolve(() => this.release());
      });
      
      if (this.onLoginQueued) {
        this.onLoginQueued({ 
          platform, 
          queuePosition: this.queue.length 
        });
      }
    });
  }

  private release(): void {
    this.currentLock = null;
    
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  hasActiveLogin(): boolean {
    return this.currentLock !== null;
  }

  getLockStatus(): LoginLock | null {
    return this.currentLock;
  }

  notifyBlocked(platform: Platform): void {
    if (this.onLoginBlocked && this.currentLock) {
      this.onLoginBlocked({
        reason: '已有登录进行中',
        currentPlatform: this.currentLock.platform,
        elapsed: Date.now() - this.currentLock.acquiredAt,
      });
    }
  }
}

export async function handleDuplicateLogin(
  platform: Platform,
  existingAccountId?: string,
  existingAccounts?: Array<{ id: string; nickname?: string }>
): Promise<DuplicateLoginDecision> {
  if (!existingAccounts || existingAccounts.length === 0) {
    return { action: 'proceed' };
  }

  if (existingAccountId) {
    const account = existingAccounts.find(a => a.id === existingAccountId);
    if (account) {
      return { 
        action: 'overwrite', 
        targetAccountId: existingAccountId 
      };
    }
  }

  return { action: 'proceed' };
}
