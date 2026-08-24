import { describe, it, expect } from 'vitest';
import {
  KUAISHOU_URLS,
  LOGIN_SELECTORS,
  UPLOAD_SELECTORS,
  STATS_SELECTORS,
  PUBLISH_URL_PATTERNS,
} from '@electron/platform/kuaishou/selectors';

describe('kuaishou/selectors', () => {
  describe('KUAISHOU_URLS', () => {
    it('has all required URL keys', () => {
      expect(KUAISHOU_URLS.creatorHome).toBeDefined();
      expect(KUAISHOU_URLS.upload).toBeDefined();
      expect(KUAISHOU_URLS.contentManage).toBeDefined();
      expect(KUAISHOU_URLS.loginPage).toBeDefined();
      expect(KUAISHOU_URLS.statsOverview).toBeDefined();
      expect(KUAISHOU_URLS.statsContent).toBeDefined();
    });

    it('URLs point to kuaishou creator domain', () => {
      Object.values(KUAISHOU_URLS).forEach(url => {
        expect(url).toContain('cp.kuaishou.com');
      });
    });
  });

  describe('LOGIN_SELECTORS', () => {
    it('has all required login selector keys', () => {
      expect(LOGIN_SELECTORS.scanLoginTab).toBeDefined();
      expect(LOGIN_SELECTORS.qrCodeImage).toBeDefined();
      expect(LOGIN_SELECTORS.qrCodeContainer).toBeDefined();
      expect(LOGIN_SELECTORS.phoneLoginText).toBeDefined();
      expect(LOGIN_SELECTORS.scanLoginText).toBeDefined();
      expect(LOGIN_SELECTORS.qrExpiredText).toBeDefined();
      expect(LOGIN_SELECTORS.qrRefreshBtn).toBeDefined();
      expect(LOGIN_SELECTORS.avatarIndicator).toBeDefined();
      expect(LOGIN_SELECTORS.usernameText).toBeDefined();
    });

    it('all selectors are non-empty strings', () => {
      Object.values(LOGIN_SELECTORS).forEach(selector => {
        expect(selector.length).toBeGreaterThan(0);
      });
    });
  });

  describe('UPLOAD_SELECTORS', () => {
    it('has all required upload selector keys', () => {
      expect(UPLOAD_SELECTORS.videoUploadArea).toBeDefined();
      expect(UPLOAD_SELECTORS.videoFileInput).toBeDefined();
      expect(UPLOAD_SELECTORS.uploadProgress).toBeDefined();
      expect(UPLOAD_SELECTORS.uploadSuccessText).toBeDefined();
      expect(UPLOAD_SELECTORS.uploadFailedText).toBeDefined();
      expect(UPLOAD_SELECTORS.uploadRetryBtn).toBeDefined();
      expect(UPLOAD_SELECTORS.titleInput).toBeDefined();
      expect(UPLOAD_SELECTORS.titleInputFallback).toBeDefined();
      expect(UPLOAD_SELECTORS.descEditor).toBeDefined();
      expect(UPLOAD_SELECTORS.descEditorFallback).toBeDefined();
      expect(UPLOAD_SELECTORS.topicInput).toBeDefined();
      expect(UPLOAD_SELECTORS.topicSuggestion).toBeDefined();
      expect(UPLOAD_SELECTORS.topicTag).toBeDefined();
      expect(UPLOAD_SELECTORS.coverSelectBtn).toBeDefined();
      expect(UPLOAD_SELECTORS.coverModal).toBeDefined();
      expect(UPLOAD_SELECTORS.coverUploadInput).toBeDefined();
      expect(UPLOAD_SELECTORS.coverConfirmBtn).toBeDefined();
      expect(UPLOAD_SELECTORS.coverAutoSelect).toBeDefined();
      expect(UPLOAD_SELECTORS.publishButton).toBeDefined();
      expect(UPLOAD_SELECTORS.publishButtonPrimary).toBeDefined();
      expect(UPLOAD_SELECTORS.publishSuccessToast).toBeDefined();
      expect(UPLOAD_SELECTORS.publishFailedToast).toBeDefined();
      expect(UPLOAD_SELECTORS.publishDraftToast).toBeDefined();
      expect(UPLOAD_SELECTORS.scheduleRadio).toBeDefined();
      expect(UPLOAD_SELECTORS.scheduleDatePicker).toBeDefined();
      expect(UPLOAD_SELECTORS.scheduleConfirmBtn).toBeDefined();
    });

    it('all selectors are non-empty strings', () => {
      Object.values(UPLOAD_SELECTORS).forEach(selector => {
        expect(selector.length).toBeGreaterThan(0);
      });
    });
  });

  describe('STATS_SELECTORS', () => {
    it('has all required stats selector keys', () => {
      expect(STATS_SELECTORS.totalPlayCount).toBeDefined();
      expect(STATS_SELECTORS.totalLikeCount).toBeDefined();
      expect(STATS_SELECTORS.totalCommentCount).toBeDefined();
      expect(STATS_SELECTORS.totalShareCount).toBeDefined();
      expect(STATS_SELECTORS.totalCollectCount).toBeDefined();
      expect(STATS_SELECTORS.statCard).toBeDefined();
      expect(STATS_SELECTORS.dateRangePicker).toBeDefined();
      expect(STATS_SELECTORS.dateRangeOptions).toBeDefined();
    });

    it('all selectors are non-empty strings', () => {
      Object.values(STATS_SELECTORS).forEach(selector => {
        expect(selector.length).toBeGreaterThan(0);
      });
    });
  });

  describe('PUBLISH_URL_PATTERNS', () => {
    it('has URL patterns for page detection', () => {
      expect(PUBLISH_URL_PATTERNS.publishPage).toContain('/article/publish/video');
      expect(PUBLISH_URL_PATTERNS.contentManage).toContain('/article/manage/video');
      expect(PUBLISH_URL_PATTERNS.dataCenter).toContain('/data/');
    });
  });
});
