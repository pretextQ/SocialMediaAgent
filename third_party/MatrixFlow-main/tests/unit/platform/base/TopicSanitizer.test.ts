import { describe, it, expect } from 'vitest';
import { TopicSanitizer } from '../../../../electron/platform/base/TopicSanitizer';

const DOUYIN_OPTS = { maxTopics: 5, platform: 'douyin' as const };
const XHS_OPTS = { maxTopics: 10, platform: 'xiaohongshu' as const };
const CHANNELS_OPTS = { maxTopics: 0, platform: 'channels' as const };

describe('TopicSanitizer', () => {
  describe('cleanTopics', () => {
    it('removes undefined string', () => {
      expect(TopicSanitizer.cleanTopics(['undefined', 'tag1'], DOUYIN_OPTS)).toEqual(['#tag1']);
    });

    it('removes null string', () => {
      expect(TopicSanitizer.cleanTopics(['null', 'tag1'], DOUYIN_OPTS)).toEqual(['#tag1']);
    });

    it('removes null JS value', () => {
      expect(TopicSanitizer.cleanTopics([null, 'tag1'], DOUYIN_OPTS)).toEqual(['#tag1']);
    });

    it('removes undefined JS value', () => {
      expect(TopicSanitizer.cleanTopics([undefined, 'tag1'], DOUYIN_OPTS)).toEqual(['#tag1']);
    });

    it('removes empty string', () => {
      expect(TopicSanitizer.cleanTopics(['', 'tag1'], DOUYIN_OPTS)).toEqual(['#tag1']);
    });

    it('removes whitespace-only string', () => {
      expect(TopicSanitizer.cleanTopics(['   ', 'tag1'], DOUYIN_OPTS)).toEqual(['#tag1']);
    });

    it('removes tags exceeding maxLength', () => {
      const longTag = 'a'.repeat(35);
      expect(TopicSanitizer.cleanTopics([longTag], DOUYIN_OPTS)).toEqual([`#${'a'.repeat(30)}`]);
    });

    it('removes tags with forbidden chars', () => {
      expect(TopicSanitizer.cleanTopics(['tag<test', 'tag1'], DOUYIN_OPTS)).toEqual(['#tag1']);
      expect(TopicSanitizer.cleanTopics(['tag"test', 'tag1'], DOUYIN_OPTS)).toEqual(['#tag1']);
      expect(TopicSanitizer.cleanTopics(['tag&test', 'tag1'], DOUYIN_OPTS)).toEqual(['#tag1']);
    });

    it('removes tags with leading # that become empty after cleaning', () => {
      expect(TopicSanitizer.cleanTopics(['#', '#tag1'], DOUYIN_OPTS)).toEqual(['#tag1']);
    });

    it('handles mixed types in raw array', () => {
      const input: unknown[] = [null, undefined, 'valid', 123, true, '', '  '];
      expect(TopicSanitizer.cleanTopics(input, DOUYIN_OPTS)).toEqual(['#valid', '#123', '#true']);
    });

    it('truncates total to maxTopics', () => {
      const input = ['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6'];
      expect(TopicSanitizer.cleanTopics(input, { maxTopics: 3, platform: 'douyin' })).toHaveLength(3);
    });

    it('adds # prefix when allowHashtag true', () => {
      expect(TopicSanitizer.cleanTopics(['tag1'], DOUYIN_OPTS)).toEqual(['#tag1']);
    });

    it('does not duplicate # when already present', () => {
      expect(TopicSanitizer.cleanTopics(['#tag1'], DOUYIN_OPTS)).toEqual(['#tag1']);
    });

    it('handles object with name key', () => {
      const input: unknown[] = [{ name: 'objtag' }];
      expect(TopicSanitizer.cleanTopics(input, DOUYIN_OPTS)).toEqual(['#objtag']);
    });
  });

  describe('limitTopics', () => {
    it('truncates when over maxTopics', () => {
      const tags = ['#tag1', '#tag2', '#tag3', '#tag4', '#tag5'];
      expect(TopicSanitizer.limitTopics(tags, 3)).toEqual(['#tag1', '#tag2', '#tag3']);
    });

    it('returns all when under maxTopics', () => {
      const tags = ['#tag1', '#tag2'];
      expect(TopicSanitizer.limitTopics(tags, 5)).toEqual(['#tag1', '#tag2']);
    });

    it('maxTopics 0 returns empty array', () => {
      expect(TopicSanitizer.limitTopics(['#tag1', '#tag2'], 0)).toEqual([]);
    });

    it('maxTopics 0 on channels clears topics', () => {
      expect(TopicSanitizer.limitTopics(['#tag1', '#tag2'], 0)).toEqual([]);
    });

    it('returns empty when input empty', () => {
      expect(TopicSanitizer.limitTopics([], 5)).toEqual([]);
    });
  });

  describe('formatTopic', () => {
    it('adds # when missing', () => {
      expect(TopicSanitizer.formatTopic('tag1')).toBe('#tag1');
    });

    it('does not duplicate #', () => {
      expect(TopicSanitizer.formatTopic('#tag1')).toBe('#tag1');
    });

    it('strips leading # before adding', () => {
      expect(TopicSanitizer.formatTopic('##tag1')).toBe('#tag1');
    });

    it('trims whitespace', () => {
      expect(TopicSanitizer.formatTopic('  tag1  ')).toBe('#tag1');
    });

    it('allowHashtag false returns raw without #', () => {
      expect(TopicSanitizer.formatTopic('tag1', false)).toBe('tag1');
    });
  });

  describe('validateTopic', () => {
    it('returns true for valid topic', () => {
      expect(TopicSanitizer.validateTopic('tag1', DOUYIN_OPTS)).toBe(true);
    });

    it('returns false for empty string', () => {
      expect(TopicSanitizer.validateTopic('', DOUYIN_OPTS)).toBe(false);
    });

    it('returns false for undefined string', () => {
      expect(TopicSanitizer.validateTopic('undefined', DOUYIN_OPTS)).toBe(false);
    });

    it('returns false for null string', () => {
      expect(TopicSanitizer.validateTopic('null', DOUYIN_OPTS)).toBe(false);
    });

    it('returns false for topic with forbidden chars', () => {
      expect(TopicSanitizer.validateTopic('tag<test', DOUYIN_OPTS)).toBe(false);
    });

    it('returns false for topic exceeding maxLength', () => {
      const longTag = 'a'.repeat(31);
      expect(TopicSanitizer.validateTopic(longTag, DOUYIN_OPTS)).toBe(false);
    });

    it('returns false for topic shorter than minLength', () => {
      expect(TopicSanitizer.validateTopic('', { ...DOUYIN_OPTS, minLength: 2 })).toBe(false);
    });

    it('returns false for non-string input', () => {
      expect(TopicSanitizer.validateTopic(null as any, DOUYIN_OPTS)).toBe(false);
      expect(TopicSanitizer.validateTopic(undefined as any, DOUYIN_OPTS)).toBe(false);
    });
  });
});