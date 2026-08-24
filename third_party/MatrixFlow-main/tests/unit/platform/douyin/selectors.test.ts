import { describe, it, expect } from 'vitest';
import {
  DOUYIN_URLS,
  LOGIN_SELECTORS,
  UPLOAD_SELECTORS,
  PUBLISH_URL_PATTERNS,
} from '@electron/platform/douyin/selectors';

describe('douyin/selectors', () => {
  describe('DOUYIN_URLS', () => {
    it('has all required URL keys', () => {
      expect(DOUYIN_URLS.creatorHome).toBeDefined();
      expect(DOUYIN_URLS.upload).toBeDefined();
      expect(DOUYIN_URLS.publishV1).toBeDefined();
      expect(DOUYIN_URLS.publishV2).toBeDefined();
      expect(DOUYIN_URLS.contentManage).toBeDefined();
      expect(DOUYIN_URLS.loginPage).toBeDefined();
    });

    it('URLs point to douyin creator domain', () => {
      Object.values(DOUYIN_URLS).forEach(url => {
        expect(url).toContain('creator.douyin.com');
      });
    });
  });

  describe('LOGIN_SELECTORS', () => {
    it('has all required login selector keys', () => {
      expect(LOGIN_SELECTORS.scanLoginTab).toBeDefined();
      expect(LOGIN_SELECTORS.qrCodeImage).toBeDefined();
      expect(LOGIN_SELECTORS.phoneLoginText).toBeDefined();
      expect(LOGIN_SELECTORS.scanLoginText).toBeDefined();
      expect(LOGIN_SELECTORS.qrExpiredText).toBeDefined();
      expect(LOGIN_SELECTORS.qrExpiredBox).toBeDefined();
    });

    it('all selectors are non-empty strings', () => {
      Object.values(LOGIN_SELECTORS).forEach(selector => {
        expect(selector.length).toBeGreaterThan(0);
      });
    });
  });

  describe('UPLOAD_SELECTORS', () => {
    it('has all required upload selector keys', () => {
      expect(UPLOAD_SELECTORS.videoFileInput).toBeDefined();
      expect(UPLOAD_SELECTORS.titleInput).toBeDefined();
      expect(UPLOAD_SELECTORS.descriptionEditor).toBeDefined();
      expect(UPLOAD_SELECTORS.publishButton).toBeDefined();
      expect(UPLOAD_SELECTORS.addTagDropdown).toBeDefined();
    });

    it('all selectors are non-empty strings', () => {
      Object.values(UPLOAD_SELECTORS).forEach(selector => {
        expect(selector.length).toBeGreaterThan(0);
      });
    });
  });

  describe('PUBLISH_URL_PATTERNS', () => {
    it('has URL patterns for version detection', () => {
      expect(PUBLISH_URL_PATTERNS.version1).toContain('/content/publish');
      expect(PUBLISH_URL_PATTERNS.version2).toContain('/content/post/video');
      expect(PUBLISH_URL_PATTERNS.contentManage).toContain('/content/manage');
    });
  });
});
