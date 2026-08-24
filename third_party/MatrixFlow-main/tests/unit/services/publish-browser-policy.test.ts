import { describe, expect, it } from 'vitest';
import { shouldPreserveStandaloneBrowserAfterFailure } from '@electron/services/publish-browser-policy';

describe('publish browser preservation policy', () => {
  it('preserves the channels browser when the original declaration fails through PublishService', () => {
    expect(shouldPreserveStandaloneBrowserAfterFailure(
      'channels',
      '上传失败: 视频号原创声明未完成',
    )).toBe(true);
  });

  it('does not preserve unrelated failures or other platforms', () => {
    expect(shouldPreserveStandaloneBrowserAfterFailure(
      'channels',
      '上传失败: 视频上传超时或失败',
    )).toBe(false);
    expect(shouldPreserveStandaloneBrowserAfterFailure(
      'douyin',
      '视频号原创声明未完成',
    )).toBe(false);
  });
});
