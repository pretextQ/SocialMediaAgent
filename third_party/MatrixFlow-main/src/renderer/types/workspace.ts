export type Platform = 'douyin' | 'xiaohongshu' | 'channels' | 'kuaishou' | 'bilibili';

export type BrowserMode = 'embedded' | 'external_chrome' | 'external_fingerprint';

export interface WorkspaceTab {
  id: string;
  accountId: string;
  platform: Platform;
  nickname: string;
  avatar?: string;
  browser_mode: BrowserMode;
  isPinned?: boolean;
}

export interface DragState {
  draggedId: string | null;
  dropTargetId: string | null;
  dropPosition: 'before' | 'after' | null;
}

export const PLATFORM_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  douyin: { label: '抖音', color: '#161823', bg: '#16182320' },
  xiaohongshu: { label: '小红书', color: '#FE2C55', bg: '#FE2C5520' },
  channels: { label: '视频号', color: '#07C160', bg: '#07C16020' },
  kuaishou: { label: '快手', color: '#FF4906', bg: '#FF490620' },
  bilibili: { label: 'B站', color: '#00A1D6', bg: '#00A1D620' },
};
