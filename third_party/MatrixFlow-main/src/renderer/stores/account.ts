import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface Account {
  id: string;
  platform: string;
  nickname: string;
  avatar?: string;
  status: 'online' | 'offline' | 'expired' | 'logging_in' | 'detecting' | 'failed';
  cookieValid: boolean;
  lastLogin?: string;
  groupId?: string;
  fingerprintId?: string;
  proxyId?: string;
  browserMode?: string;
  remark?: string;
  createdAt: string;
  updatedAt?: string;
  proxyInfo?: { id: string; name: string; protocol: string; host: string; port: number } | null;
  groupIds?: string[];
  groupInfos?: Array<{ id: string; name: string; color: string }>;
  homepageUrl?: string;
}

export type BrowserType = 'embedded' | 'chrome' | 'fingerprint';

export interface BrowserConfig {
  type: BrowserType;
  executablePath?: string;
  fingerprintId?: string;
  proxyId?: string;
  headless?: boolean;
}

export interface LoginState {
  status: 'idle' | 'logging_in' | 'detecting' | 'success' | 'failed' | 'timeout' | 'cancelled';
  platform?: string;
  accountId?: string;
  error?: string;
}

export const useAccountStore = defineStore('account', () => {
  const accounts = ref<Account[]>([]);
  const loading = ref(false);
  const loginState = ref<LoginState>({ status: 'idle' });

  const onlineCount = computed(() => accounts.value.filter((a) => a.status === 'online').length);
  const totalCount = computed(() => accounts.value.length);

  async function fetchAccounts() {
    if (!window.matrixflow) return;
    loading.value = true;
    try {
      const list = await window.matrixflow.accounts.list();
      accounts.value = list as Account[];
    } finally {
      loading.value = false;
    }
  }

  async function createAccount(data: Partial<Account>) {
    if (!window.matrixflow) return;
    const account = await window.matrixflow.accounts.create(data);
    accounts.value.push(account as Account);
    return account;
  }

  async function deleteAccount(id: string) {
    if (!window.matrixflow) return;
    await window.matrixflow.accounts.delete(id);
    accounts.value = accounts.value.filter((a) => a.id !== id);
  }

  async function loginAccount(id: string) {
    if (!window.matrixflow) return;
    const result = await window.matrixflow.accounts.login(id);
    if (!result?.success) {
      throw new Error(result?.message || '重新登录失败');
    }
    await fetchAccounts();
    return result;
  }

  async function checkCookie(id: string) {
    if (!window.matrixflow) return false;
    return window.matrixflow.accounts.checkCookie(id);
  }

  async function setFingerprint(accountId: string, fingerprintId: string | null) {
    if (!window.matrixflow) return;
    await window.matrixflow.account.setFingerprint(accountId, fingerprintId);
    const account = accounts.value.find(a => a.id === accountId);
    if (account) {
      account.fingerprintId = fingerprintId || undefined;
    }
  }

  async function setProxy(accountId: string, proxyId: string | null) {
    if (!window.matrixflow) return;
    await window.matrixflow.account.setProxy(accountId, proxyId);
    const account = accounts.value.find(a => a.id === accountId);
    if (account) {
      account.proxyId = proxyId || undefined;
    }
  }

  async function updateRemark(accountId: string, remark: string) {
    if (!window.matrixflow) return;
    await window.matrixflow.accounts.updateRemark(accountId, remark);
    const account = accounts.value.find(a => a.id === accountId);
    if (account) {
      account.remark = remark || undefined;
    }
  }

  async function startLogin(platform: string, browserConfig: BrowserConfig, existingAccountId?: string) {
    if (!window.matrixflow) return;
    
    loginState.value = { status: 'logging_in', platform };
    
    const result = await window.matrixflow.accounts.startLogin({
      platform,
      browserConfig: browserConfig as unknown as Record<string, unknown>,
      existingAccountId,
    });
    
    if (result.success && result.data) {
      loginState.value = { status: 'success', platform, accountId: result.data.accountId };
      await fetchAccounts();
    } else {
      loginState.value = { status: 'failed', platform, error: result.message };
    }
    
    return result;
  }

  async function cancelLogin() {
    if (!window.matrixflow) return;
    await window.matrixflow.accounts.cancelLogin();
    loginState.value = { status: 'cancelled' };
  }

  function resetLoginState() {
    loginState.value = { status: 'idle' };
  }

  function setupLoginListeners() {
    if (!window.matrixflow) return () => {};
    
    const unsubscribers: Array<() => void> = [];
    
    const handleLoginStatus = (data: unknown) => {
      const { status, accountId, platform } = data as { status: string; accountId?: string; platform?: string };
      loginState.value = { status: status as LoginState['status'], accountId, platform };
      
      if (accountId) {
        const account = accounts.value.find(a => a.id === accountId);
        if (account) {
          account.status = status as Account['status'];
          account.cookieValid = status === 'online';
        }
      }
    };
    
    const handleLoginSuccess = async (data: unknown) => {
      const { accountId, platform } = data as { accountId: string; platform: string };
      loginState.value = { status: 'success', accountId, platform };
      await fetchAccounts();
    };
    
    const handleLoginFailed = (data: unknown) => {
      const { error, platform } = data as { error: string; platform: string };
      loginState.value = { status: 'failed', error, platform };
    };
    
    const handleLoginTimeout = (data: unknown) => {
      const { platform } = data as { platform: string };
      loginState.value = { status: 'timeout', platform };
    };
    
    const handleLoginCancelled = (data: unknown) => {
      const { reason } = data as { reason: string };
      loginState.value = { status: 'cancelled', error: reason };
    };
    
    unsubscribers.push(window.matrixflow.on('account:login-status', handleLoginStatus));
    unsubscribers.push(window.matrixflow.on('account:login-success', handleLoginSuccess));
    unsubscribers.push(window.matrixflow.on('account:login-failed', handleLoginFailed));
    unsubscribers.push(window.matrixflow.on('account:login-timeout', handleLoginTimeout));
    unsubscribers.push(window.matrixflow.on('account:login-cancelled', handleLoginCancelled));
    
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }

  return {
    accounts,
    loading,
    loginState,
    onlineCount,
    totalCount,
    fetchAccounts,
    createAccount,
    deleteAccount,
    loginAccount,
    checkCookie,
    setFingerprint,
    setProxy,
    updateRemark,
    startLogin,
    cancelLogin,
    resetLoginState,
    setupLoginListeners,
  };
});
