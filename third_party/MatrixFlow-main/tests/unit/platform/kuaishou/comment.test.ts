import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page } from 'patchright';

// Mock selectorUtils before importing the module
vi.mock('@electron/platform/base/selectorUtils', () => ({
  trySelectors: vi.fn(),
  clickWithFallback: vi.fn(),
}));

vi.mock('@electron/platform/kuaishou/cookie', () => ({
  getCookiePath: vi.fn(() => '/tmp/cookies/kuaishou/test.json'),
  cookieExists: vi.fn(() => true),
}));

function createMockPage(overrides: Record<string, unknown> = {}) {
  const mockLocator = {
    isVisible: vi.fn(() => Promise.resolve(false)),
    click: vi.fn(() => Promise.resolve()),
    fill: vi.fn(() => Promise.resolve()),
    first: vi.fn(function(this: any) { return this; }),
    all: vi.fn(() => Promise.resolve([])),
    textContent: vi.fn(() => Promise.resolve('')),
    scrollIntoViewIfNeeded: vi.fn(() => Promise.resolve()),
    count: vi.fn(() => Promise.resolve(0)),
  };

  return {
    goto: vi.fn(() => Promise.resolve()),
    waitForTimeout: vi.fn(() => Promise.resolve()),
    url: vi.fn(() => 'https://www.kuaishou.com/short-video/test123'),
    locator: vi.fn(() => mockLocator),
    keyboard: {
      press: vi.fn(() => Promise.resolve()),
      type: vi.fn(() => Promise.resolve()),
    },
    getByText: vi.fn((text: string) => ({
      isVisible: vi.fn(() => Promise.resolve(false)),
      first: vi.fn(function(this: any) { return this; }),
    })),
    ...overrides,
  } as unknown as Page;
}

describe('kuaishou/comment', () => {
  let resolveTemplateVariables: typeof import('@electron/platform/kuaishou/comment').resolveTemplateVariables;
  let pickRandomTemplate: typeof import('@electron/platform/kuaishou/comment').pickRandomTemplate;
  let postComment: typeof import('@electron/platform/kuaishou/comment').postComment;
  let fetchComments: typeof import('@electron/platform/kuaishou/comment').fetchComments;
  let replyComment: typeof import('@electron/platform/kuaishou/comment').replyComment;
  let deleteComment: typeof import('@electron/platform/kuaishou/comment').deleteComment;
  let postCommentWithRetry: typeof import('@electron/platform/kuaishou/comment').postCommentWithRetry;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@electron/platform/kuaishou/comment');
    resolveTemplateVariables = mod.resolveTemplateVariables;
    pickRandomTemplate = mod.pickRandomTemplate;
    postComment = mod.postComment;
    fetchComments = mod.fetchComments;
    replyComment = mod.replyComment;
    deleteComment = mod.deleteComment;
    postCommentWithRetry = mod.postCommentWithRetry;
  });

  describe('resolveTemplateVariables', () => {
    it('replaces {{time}} with time string', () => {
      const result = resolveTemplateVariables('现在是{{time}}');
      expect(result).toMatch(/现在是\d{1,2}:\d{2}/);
    });

    it('replaces {{date}} with date string', () => {
      const result = resolveTemplateVariables('今天是{{date}}');
      expect(result).toContain('今天是');
      expect(result).not.toContain('{{date}}');
    });

    it('replaces {{weekday}} with Chinese weekday', () => {
      const result = resolveTemplateVariables('星期{{weekday}}');
      expect(result).toMatch(/星期[日一二三四五六]/);
    });

    it('replaces {{year}}, {{month}}, {{day}}, {{hour}}', () => {
      const result = resolveTemplateVariables('{{year}}年{{month}}月{{day}}日{{hour}}时');
      expect(result).not.toContain('{{');
      expect(result).toMatch(/\d+年\d+月\d+日\d+时/);
    });

    it('replaces custom variables from vars parameter', () => {
      const result = resolveTemplateVariables('你好{{name}}', { name: '快手' });
      expect(result).toBe('你好快手');
    });

    it('returns original string when no template variables', () => {
      const result = resolveTemplateVariables('没有变量的文本');
      expect(result).toBe('没有变量的文本');
    });

    it('handles undefined vars', () => {
      const result = resolveTemplateVariables('普通文本', undefined);
      expect(result).toBe('普通文本');
    });

    it('handles multiple occurrences of same variable', () => {
      const result = resolveTemplateVariables('{{hour}}:{{hour}}', {});
      const hour = String(new Date().getHours());
      expect(result).toBe(`${hour}:${hour}`);
    });

    it('leaves unmatched custom variables unchanged', () => {
      const result = resolveTemplateVariables('你好{{unknown}}');
      expect(result).toBe('你好{{unknown}}');
    });
  });

  describe('pickRandomTemplate', () => {
    it('returns an element from the list', () => {
      const templates = ['模板一', '模板二', '模板三'];
      const result = pickRandomTemplate(templates);
      expect(templates).toContain(result);
    });

    it('throws when list is empty', () => {
      expect(() => pickRandomTemplate([])).toThrow('模板列表为空');
    });

    it('returns the only element when list has one item', () => {
      expect(pickRandomTemplate(['唯一'])).toBe('唯一');
    });
  });

  describe('postComment', () => {
    it('returns success when all steps pass', async () => {
      const { trySelectors, clickWithFallback } = await import('@electron/platform/base/selectorUtils');
      const mockInput = { click: vi.fn(), fill: vi.fn() };
      vi.mocked(trySelectors).mockResolvedValue(mockInput as any);
      vi.mocked(clickWithFallback).mockResolvedValue(true);

      const page = createMockPage();
      const result = await postComment(page, 'video123', '测试评论');
      expect(result.success).toBe(true);
    });

    it('returns failure when navigation fails', async () => {
      const page = createMockPage({
        goto: vi.fn(() => Promise.reject(new Error('timeout'))),
        url: vi.fn(() => 'https://passport.kuaishou.com/login'),
      });
      const result = await postComment(page, 'video123', '测试评论');
      expect(result.success).toBe(false);
    });

    it('returns failure when comment input not found', async () => {
      const { trySelectors } = await import('@electron/platform/base/selectorUtils');
      vi.mocked(trySelectors).mockResolvedValue(null);
      const page = createMockPage();
      const result = await postComment(page, 'video123', '测试评论');
      expect(result.success).toBe(false);
      expect(result.message).toContain('未找到评论输入框');
    });
  });

  describe('fetchComments', () => {
    it('returns empty array when navigation fails', async () => {
      const page = createMockPage({
        goto: vi.fn(() => Promise.reject(new Error('fail'))),
      });
      const result = await fetchComments(page, 'video123');
      expect(result).toEqual([]);
    });

    it('returns comments when found', async () => {
      const mockItems = [
        { textContent: vi.fn(() => Promise.resolve('评论1')) },
        { textContent: vi.fn(() => Promise.resolve('评论2')) },
      ];
      const page = createMockPage({
        locator: vi.fn(() => ({
          all: vi.fn(() => Promise.resolve(mockItems)),
          isVisible: vi.fn(() => Promise.resolve(false)),
          first: vi.fn(function(this: any) { return this; }),
        })),
      });
      const result = await fetchComments(page, 'video123', 10);
      expect(result.length).toBe(2);
    });
  });

  describe('deleteComment', () => {
    it('returns success when delete button is found and clicked', async () => {
      const page = createMockPage({
        locator: vi.fn(() => ({
          isVisible: vi.fn(() => Promise.resolve(true)),
          click: vi.fn(() => Promise.resolve()),
          first: vi.fn(function(this: any) { return this; }),
        })),
      });
      const result = await deleteComment(page, 'video123', 'comment1');
      expect(result.success).toBe(true);
    });

    it('returns failure when delete button not found', async () => {
      const page = createMockPage({
        locator: vi.fn(() => ({
          isVisible: vi.fn(() => Promise.resolve(false)),
          click: vi.fn(() => Promise.resolve()),
          first: vi.fn(function(this: any) { return this; }),
        })),
      });
      const result = await deleteComment(page, 'video123', 'comment1');
      expect(result.success).toBe(false);
      expect(result.message).toContain('未找到删除按钮');
    });
  });

  describe('postCommentWithRetry', () => {
    it('retries on failure and returns last result', async () => {
      const page = createMockPage({
        goto: vi.fn(() => Promise.reject(new Error('fail'))),
      });
      const result = await postCommentWithRetry(page, {
        accountId: 'acc1',
        videoId: 'vid1',
        comment: 'test',
      }, 2);
      expect(result.success).toBe(false);
      expect(result.message).toContain('已重试 2 次');
    });
  });
});
