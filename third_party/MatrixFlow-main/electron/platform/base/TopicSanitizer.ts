/**
 * TopicSanitizer — 话题清洗与校验
 * 统一处理各平台话题的：去 undefined/null、空字符串、超长话题、非法字符、数量限制
 */

import type { PlatformId } from '../adapter';

export interface TopicSanitizerOptions {
  /** 平台话题上限（0 表示不支持话题） */
  maxTopics: number;
  /** 最小字符数（默认 1） */
  minLength?: number;
  /** 单话题最大字符数（默认 30） */
  maxLength?: number;
  /** 是否自动加 #（默认 true） */
  allowHashtag?: boolean;
  /** 平台 ID */
  platform: PlatformId;
}

/** 话题来源类型（PublishContext.tags 为 string[]，但原始输入可能是混合类型） */
type RawTopic = string | number | boolean | null | undefined;

const INVALID_PATTERNS = [
  /^(?:undefined|null)$/i,
  /^(?:undefined|null)\b[\s:：,，、-]*/i,
];

const FORBIDDEN_CHARS = /[<>"'&]/;

export class TopicSanitizer {
  /**
   * 清洗话题：去除 #undefined、#null、空字符串、超长话题、非法字符
   * @param rawTopics 原始话题数组（可能是混合类型）
   * @param options 清洗选项
   * @returns 格式化后的话题数组（已添加 # 前缀）
   */
  static cleanTopics(rawTopics: unknown[], options: TopicSanitizerOptions): string[] {
    const minLen = options.minLength ?? 1;
    const maxLen = options.maxLength ?? 30;
    const allowHashtag = options.allowHashtag ?? true;

    return (rawTopics ?? [])
      .map((raw) => this.toString(raw as RawTopic))
      .map((tag) => tag.trim())
      // 去除含非法字符的话题（先 trim 再检查）
      .filter((tag) => !FORBIDDEN_CHARS.test(tag))
      // 去除 JS undefined/null 字符串值
      .filter((tag) => !INVALID_PATTERNS.some((p) => p.test(tag)))
      // 统一去前导 #
      .map((tag) => tag.replace(/^#+\s*/, '').trim())
      // 去除空字符串（trim 后）
      .filter((tag) => tag.length >= minLen)
      // 截断超长话题
      .map((tag) => (tag.length > maxLen ? tag.slice(0, maxLen) : tag))
      // 最终过滤（处理截断后变空的情况）
      .filter((tag) => tag.length > 0)
      // 限制总数
      .slice(0, options.maxTopics)
      // 统一添加 # 前缀
      .map((tag) => (allowHashtag && !tag.startsWith('#') ? `#${tag}` : tag));
  }

  /**
   * 限制话题数量：超出的截断
   * @param topics 已格式化的话题数组（cleanTopics 输出）
   * @param maxTopics 最大话题数（0 → 清空）
   */
  static limitTopics(topics: string[], maxTopics: number): string[] {
    if (maxTopics === 0) return [];
    return topics.slice(0, maxTopics);
  }

  /**
   * 格式化单个话题：确保有 # 前缀
   * @param topic 原始话题字符串
   * @param allowHashtag 是否添加 #
   */
  static formatTopic(topic: string, allowHashtag = true): string {
    const trimmed = topic.trim().replace(/^#+\s*/, '');
    if (allowHashtag && !trimmed.startsWith('#')) {
      return `#${trimmed}`;
    }
    return trimmed;
  }

  /**
   * 校验单个话题是否合法
   * @param topic 话题字符串
   * @param options 校验选项
   */
  static validateTopic(topic: string, options: TopicSanitizerOptions): boolean {
    if (!topic || typeof topic !== 'string') return false;
    const minLen = options.minLength ?? 1;
    const maxLen = options.maxLength ?? 30;
    const allowHashtag = options.allowHashtag ?? true;

    const formatted = TopicSanitizer.formatTopic(topic.trim(), allowHashtag);

    // 长度校验
    if (formatted.length < minLen) return false;
    if (formatted.length > maxLen) return false;

    // 非法字符校验（format 后再检查，确保 # 不是非法字符）
    if (FORBIDDEN_CHARS.test(formatted)) return false;

    // JS undefined/null 字符串校验
    const formattedWithoutHash = formatted.replace(/^#+\s*/, '').trim();
    if (INVALID_PATTERNS.some((p) => p.test(formattedWithoutHash))) return false;

    return true;
  }

  private static toString(raw: RawTopic): string {
    if (typeof raw === 'string') return raw;
    if (raw === null || raw === undefined) return '';
    if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
    if (typeof raw === 'object') {
      const record = raw as Record<string, unknown>;
      for (const key of ['name', 'label', 'value', 'title', 'text']) {
        const val = record[key];
        if (typeof val === 'string') return val;
        if (typeof val === 'number') return String(val);
      }
    }
    return '';
  }
}