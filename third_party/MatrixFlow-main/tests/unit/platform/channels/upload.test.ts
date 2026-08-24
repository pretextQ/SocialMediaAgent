import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExistsSync = vi.fn();
const mockCookieExists = vi.fn();
const mockGetCookiePath = vi.fn(() => '/tmp/generated/channels-account.json');

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
  },
  existsSync: mockExistsSync,
}));

vi.mock('@electron/platform/channels/cookie', () => ({
  getCookiePath: mockGetCookiePath,
  cookieExists: mockCookieExists,
}));

vi.mock('patchright', () => ({
  chromium: {
    launch: vi.fn(),
  },
}));

vi.mock('@electron/platform/base/DebugRecorder', () => ({
  getDebugRecorder: () => ({
    setSessionId: vi.fn(),
    recordStep: vi.fn((_name: string, fn: () => unknown) => fn()),
  }),
}));

describe('channels/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockCookieExists.mockReturnValue(false);
  });

  it('uses cookiePath from upload context before falling back to generated path', async () => {
    const { uploadVideo } = await import('@electron/platform/channels/upload');

    const result = await uploadVideo({
      accountId: 'channels_account',
      videoPath: '/tmp/video.mp4',
      title: '测试视频',
      cookiePath: '/tmp/db/channels_account.json',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('/tmp/db/channels_account.json');
    expect(mockCookieExists).toHaveBeenCalledWith('/tmp/db/channels_account.json');
    expect(mockGetCookiePath).not.toHaveBeenCalled();
  });

  it('builds the embedded video description without the internal task title', async () => {
    const { buildEmbeddedDescriptionText } = await import('@electron/platform/channels/upload');

    const result = buildEmbeddedDescriptionText({
      accountId: 'channels_account',
      videoPath: '/tmp/video.mp4',
      title: '父母的觉醒好书推荐',
      description: '孩子不需要我们的主张和期望',
      tags: ['好书推荐', '父母的觉醒'],
    });

    expect(result.text).toBe('孩子不需要我们的主张和期望');
    expect(result.text).not.toContain('父母的觉醒好书推荐');
    expect(result.tagCount).toBe(2);
  });

  it('does not fall back to the internal task title when the video description is empty', async () => {
    const { buildEmbeddedDescriptionText } = await import('@electron/platform/channels/upload');

    const result = buildEmbeddedDescriptionText({
      accountId: 'channels_account',
      videoPath: '/tmp/video.mp4',
      title: '父母的觉醒好书推荐',
    });

    expect(result.text).toBe('');
  });

  it('builds the embedded short title from the internal task title', async () => {
    const { buildEmbeddedShortTitle } = await import('@electron/platform/channels/upload');

    expect(buildEmbeddedShortTitle({
      accountId: 'channels_account',
      videoPath: '/tmp/video.mp4',
      title: '父母的觉醒好书推荐',
      description: '孩子不需要我们的主张和期望',
    })).toBe('父母的觉醒好书推荐');
  });

  it('preserves the selected local date and minute for channels scheduling', async () => {
    const { formatEmbeddedScheduleDateTime } = await import('@electron/platform/channels/upload');
    const scheduledTime = new Date(2026, 5, 10, 7, 51, 0);

    expect(formatEmbeddedScheduleDateTime(scheduledTime)).toEqual({
      dateTimeText: '2026-06-10 07:51',
      dateText: '2026-06-10',
      timeText: '07:51',
    });
  });

  it('opens the channels picker, clicks the target date, submits the time and replaces a stale date', async () => {
    vi.useFakeTimers();
    const executeJavaScript = vi.fn()
      .mockImplementationOnce(async (script: string) => {
        expect(() => new Function(`return ${script}`)).not.toThrow();
        expect(script).toContain('findMainInput');
        return {
          toggled: false,
          opened: true,
          x: 120,
          y: 240,
          mainValue: '2026-06-07 01:00',
          placeholder: '请选择发表时间',
        };
      })
      .mockImplementationOnce(async (script: string) => {
        expect(() => new Function(`return ${script}`)).not.toThrow();
        return {
          verified: true,
          mainValue: '2026-06-10 07:51',
        };
      });
    const mainFrameExecuteJavaScript = vi.fn()
      .mockImplementationOnce(async (script: string) => {
        expect(() => new Function(`return ${script}`)).not.toThrow();
        return {
          ready: false,
          tables: 0,
          days: 0,
          overlays: [],
        };
      })
      .mockImplementationOnce(async (script: string) => {
        expect(() => new Function(`return ${script}`)).not.toThrow();
        return {
          targetFound: false,
          clickedNext: false,
          targetText: '',
          targetClass: '',
          x: 0,
          y: 0,
          debug: [],
        };
      })
      .mockImplementationOnce(async (script: string) => {
        expect(() => new Function(`return ${script}`)).not.toThrow();
        return {
          timeFilled: false,
          timeValue: '',
          confirmText: '',
          confirmFound: false,
          confirmX: 0,
          confirmY: 0,
        };
      });
    const childFrameExecuteJavaScript = vi.fn()
      .mockImplementationOnce(async (script: string) => {
        expect(() => new Function(`return ${script}`)).not.toThrow();
        return {
          ready: true,
          tables: 1,
          days: 42,
          overlays: ['weui-desktop-picker'],
        };
      })
      .mockImplementationOnce(async (script: string) => {
        expect(() => new Function(`return ${script}`)).not.toThrow();
        return {
          targetFound: true,
          clickedNext: false,
          targetText: '10',
          targetClass: 'weui-desktop-picker__day',
          x: 320,
          y: 420,
          debug: [],
        };
      })
      .mockImplementationOnce(async (script: string) => {
        expect(() => new Function(`return ${script}`)).not.toThrow();
        expect(script).toContain("(/^确定$|^完成$/)");
        return {
          timeFilled: true,
          timeValue: '07:51',
          confirmText: '',
          confirmFound: false,
          confirmX: 0,
          confirmY: 0,
        };
      });
    const childFrame = {
      url: 'https://channels.weixin.qq.com/micro/content/post/create',
      executeJavaScript: childFrameExecuteJavaScript,
    };
    const mainFrame = {
      url: 'https://channels.weixin.qq.com/platform/post/create',
      framesInSubtree: [childFrame],
      executeJavaScript: mainFrameExecuteJavaScript,
    };
    const sendInputEvent = vi.fn();

    try {
      const { applyEmbeddedSchedule } = await import('@electron/platform/channels/upload');
      const resultPromise = applyEmbeddedSchedule(
        { executeJavaScript, mainFrame, sendInputEvent } as never,
        new Date(2026, 5, 10, 7, 51, 0),
      );
      await vi.runAllTimersAsync();

      await expect(resultPromise).resolves.toBe(true);
      expect(executeJavaScript).toHaveBeenCalledTimes(2);
      expect(mainFrameExecuteJavaScript).toHaveBeenCalledTimes(3);
      expect(childFrameExecuteJavaScript).toHaveBeenCalledTimes(3);
      expect(sendInputEvent).toHaveBeenCalledTimes(10);
      expect(sendInputEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'mouseDown',
        x: 320,
        y: 420,
      }));
      expect(sendInputEvent).toHaveBeenCalledWith({
        type: 'keyDown',
        keyCode: 'Enter',
      });
      expect(sendInputEvent).toHaveBeenCalledWith({
        type: 'keyDown',
        keyCode: 'Tab',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('fills the complete hour and minute in the standalone channels picker', async () => {
    const scheduledTime = new Date(Date.now() + 3 * 60 * 60 * 1000);
    scheduledTime.setSeconds(0, 0);
    const pad = (value: number) => String(value).padStart(2, '0');
    const expectedTime = `${pad(scheduledTime.getHours())}:${pad(scheduledTime.getMinutes())}`;
    const expectedDate = `${scheduledTime.getFullYear()}-${pad(scheduledTime.getMonth() + 1)}-${pad(scheduledTime.getDate())}`;
    const timeFill = vi.fn();

    const labels = [
      { isVisible: vi.fn().mockResolvedValue(false), click: vi.fn() },
      { isVisible: vi.fn().mockResolvedValue(true), click: vi.fn() },
    ];
    const scheduleLabels = {
      count: vi.fn().mockResolvedValue(labels.length),
      first: () => labels[0],
      nth: (index: number) => labels[index],
    };
    const dateInput = {
      count: vi.fn().mockResolvedValue(1),
      click: vi.fn(),
      inputValue: vi.fn().mockResolvedValue(expectedDate),
    };
    const monthParent = {
      innerText: vi.fn().mockResolvedValue(`${scheduledTime.getFullYear()}年${scheduledTime.getMonth() + 1}月`),
    };
    const monthLabel = {
      innerText: vi.fn().mockResolvedValue(`${scheduledTime.getMonth() + 1}月`),
      locator: vi.fn().mockReturnValue(monthParent),
    };
    const day = {
      getAttribute: vi.fn().mockResolvedValue(''),
      innerText: vi.fn().mockResolvedValue(String(scheduledTime.getDate())),
      click: vi.fn(),
    };
    const dayTable = {
      count: vi.fn().mockResolvedValue(1),
      nth: vi.fn().mockReturnValue(day),
    };
    const timeInput = {
      count: vi.fn().mockResolvedValue(1),
      click: vi.fn(),
      fill: timeFill,
      inputValue: vi.fn().mockResolvedValue(expectedTime),
    };
    const page = {
      locator: vi.fn((selector: string) => {
        if (selector.includes('label:has-text("定时")')) return scheduleLabels;
        if (selector.includes('placeholder="请选择发表时间"')) return { first: () => dateInput };
        if (selector.includes('panel__label')) return { first: () => monthLabel };
        if (selector.includes('picker__table')) return dayTable;
        if (selector.includes('placeholder="请选择时间"')) return { first: () => timeInput };
        return { first: () => ({ count: vi.fn().mockResolvedValue(0) }) };
      }),
      waitForTimeout: vi.fn(),
      keyboard: { press: vi.fn() },
    };

    const { applySchedule } = await import('@electron/platform/channels/publish');
    await expect(applySchedule(page as never, scheduledTime)).resolves.toBe(true);
    expect(timeFill).toHaveBeenCalledWith(expectedTime);
    expect(labels[1].click).toHaveBeenCalled();
  });

  it('clicks the location row right edge and selects hide-location from a portal root', async () => {
    vi.useFakeTimers();
    const executeJavaScript = vi.fn()
      .mockResolvedValueOnce({ clicked: true, text: '选择位置', method: 'right-edge' })
      .mockImplementationOnce(async (script: string) => {
        expect(() => new Function(`return ${script}`)).not.toThrow();
        return { picked: false, debug: [], rootsContainingTarget: 1 };
      })
      .mockResolvedValueOnce({ picked: true, text: '不显示位置', tag: 'DIV' });

    try {
      const { applyEmbeddedLocation } = await import('@electron/platform/channels/upload');
      const promise = applyEmbeddedLocation({ executeJavaScript } as never, '');
      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBe(true);
      expect(executeJavaScript.mock.calls[0][0]).toContain('elementFromPoint');
      expect(executeJavaScript.mock.calls[1][0]).toContain('const roots = collectRoots()');
      expect(executeJavaScript.mock.calls[1][0]).toContain("querySelectorAll('*')");
      expect(executeJavaScript.mock.calls[1][0]).toContain('不显示位置');
      expect(executeJavaScript).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the embedded browser open when a sequential field step fails', async () => {
    const { shouldKeepBrowserOnPublishFailure } = await import('@electron/platform/channels/upload');

    expect(shouldKeepBrowserOnPublishFailure('视频号位置设置失败，未能选择“不显示位置”')).toBe(true);
    expect(shouldKeepBrowserOnPublishFailure('视频号定时发表设置失败')).toBe(true);
    expect(shouldKeepBrowserOnPublishFailure('视频号原创声明未完成')).toBe(true);
    expect(shouldKeepBrowserOnPublishFailure('视频上传超时或失败')).toBe(false);
  });

  it('only applies the channels original statement when declaration is original', async () => {
    const { shouldApplyOriginalStatement } = await import('@electron/platform/channels/upload');
    const baseContext = {
      accountId: 'channels_account',
      videoPath: '/tmp/video.mp4',
      title: '原创视频测试',
    };

    expect(shouldApplyOriginalStatement({
      ...baseContext,
      declaration: 'original',
    })).toBe(true);
    expect(shouldApplyOriginalStatement({
      ...baseContext,
      declaration: '',
    })).toBe(false);
  });

  it('applies the embedded original declaration in three verified steps', async () => {
    vi.useFakeTimers();
    const executeJavaScript = vi.fn()
      .mockImplementationOnce(async (script: string) => {
        expect(() => new Function(`return ${script}`)).not.toThrow();
        expect(script).toContain("text === '声明原创'");
        return {
          found: true,
          clicked: true,
          alreadyChecked: true,
          method: 'native-checkbox',
        };
      })
      .mockImplementationOnce(async (script: string) => {
        expect(() => new Function(`return ${script}`)).not.toThrow();
        expect(script).toContain("normalized.includes('我已阅读并同意')");
        expect(script).toContain("normalized.includes('原创声明须知')");
        expect(script).toContain("normalized.includes('使用条款')");
        return {
          found: true,
          acted: true,
          accepted: true,
          method: 'native-checkbox',
          debug: null,
        };
      })
      .mockImplementationOnce(async (script: string) => {
        expect(() => new Function(`return ${script}`)).not.toThrow();
        expect(script).toContain("=== '声明原创'");
        return { found: true, clicked: true, text: '声明原创' };
      })
      .mockImplementationOnce(async (script: string) => {
        expect(() => new Function(`return ${script}`)).not.toThrow();
        return true;
      });

    try {
      const { applyEmbeddedOriginalStatement } = await import('@electron/platform/channels/upload');
      const resultPromise = applyEmbeddedOriginalStatement({
        executeJavaScript,
      } as never, {
        accountId: 'channels_account',
        videoPath: '/tmp/video.mp4',
        title: '原创视频测试',
        declaration: 'original',
      });
      await vi.runAllTimersAsync();

      await expect(resultPromise).resolves.toBe(true);
      expect(executeJavaScript).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for an asynchronously updated custom original checkbox instead of failing immediately', async () => {
    vi.useFakeTimers();
    const executeJavaScript = vi.fn()
      .mockResolvedValueOnce({
        found: true,
        clicked: true,
        alreadyChecked: false,
        method: 'custom-checkbox',
      })
      .mockResolvedValueOnce({
        found: true,
        acted: true,
        accepted: false,
        reason: 'waiting-for-checked-state',
        debug: null,
      })
      .mockResolvedValueOnce({
        found: true,
        acted: false,
        accepted: true,
        method: 'declare-button-enabled',
        debug: null,
      })
      .mockResolvedValueOnce({
        found: true,
        clicked: true,
        disabled: false,
        text: '声明原创',
      })
      .mockResolvedValueOnce(true);

    try {
      const { applyEmbeddedOriginalStatement } = await import('@electron/platform/channels/upload');
      const resultPromise = applyEmbeddedOriginalStatement({
        executeJavaScript,
      } as never, {
        accountId: 'channels_account',
        videoPath: '/tmp/video.mp4',
        title: '原创视频测试',
        declaration: 'original',
      });
      await vi.runAllTimersAsync();

      await expect(resultPromise).resolves.toBe(true);
      expect(executeJavaScript).toHaveBeenCalledTimes(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('continues an existing original dialog when retrying with the main checkbox already checked', async () => {
    vi.useFakeTimers();
    const executeJavaScript = vi.fn()
      .mockResolvedValueOnce({
        found: true,
        clicked: false,
        alreadyChecked: true,
        method: 'native-already-checked',
      })
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({
        found: true,
        acted: false,
        accepted: true,
        method: 'native-checked',
        debug: null,
      })
      .mockResolvedValueOnce({
        found: true,
        clicked: true,
        disabled: false,
        text: '声明原创',
      })
      .mockResolvedValueOnce(true);

    try {
      const { applyEmbeddedOriginalStatement } = await import('@electron/platform/channels/upload');
      const resultPromise = applyEmbeddedOriginalStatement({
        executeJavaScript,
      } as never, {
        accountId: 'channels_account',
        videoPath: '/tmp/video.mp4',
        title: '原创视频测试',
        declaration: 'original',
      });
      await vi.runAllTimersAsync();

      await expect(resultPromise).resolves.toBe(true);
      expect(executeJavaScript).toHaveBeenCalledTimes(5);
    } finally {
      vi.useRealTimers();
    }
  });
});
