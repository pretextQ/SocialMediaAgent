import { ref } from 'vue';

/** 深色模式状态（可由外部同步 Element Plus 的 isDark） */
export const isDark = ref(false);

/** 从 :root 读取 CSS 变量的实际值 */
export const cssVar = (name: string, fallback?: string): string => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback || '';
};

/** 平台品牌色映射（优先读取 CSS 变量，保留 fallback） */
export const PLATFORM_COLORS: Record<string, string> = {
  '抖音': cssVar('--color-plat-douyin', '#000000'),
  'douyin': cssVar('--color-plat-douyin', '#000000'),
  '小红书': cssVar('--color-plat-xiaohongshu', '#FF2442'),
  'xiaohongshu': cssVar('--color-plat-xiaohongshu', '#FF2442'),
  '视频号': cssVar('--color-plat-wechat', '#07C160'),
  'weixin': cssVar('--color-plat-wechat', '#07C160'),
  '快手': cssVar('--color-plat-kuaishou', '#FF4906'),
  'kuaishou': cssVar('--color-plat-kuaishou', '#FF4906'),
};
