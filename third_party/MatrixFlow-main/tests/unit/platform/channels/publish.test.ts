import { beforeEach, describe, expect, it, vi } from 'vitest';

const humanClick = vi.fn();
const humanType = vi.fn();

vi.mock('@electron/platform/base/RiskControl', () => ({
  PageRiskControl: class {
    humanClick = humanClick;
    humanType = humanType;
  },
}));

vi.mock('@electron/platform/base/DebugRecorder', () => ({
  getDebugRecorder: () => ({
    recordStep: vi.fn((_name: string, fn: () => unknown) => fn()),
  }),
}));

function createPage() {
  const editor = {
    count: vi.fn().mockResolvedValue(1),
    waitFor: vi.fn().mockResolvedValue(undefined),
  };
  const shortTitleInput = {
    count: vi.fn().mockResolvedValue(1),
    isVisible: vi.fn().mockResolvedValue(true),
  };

  return {
    locator: vi.fn((selector: string) => ({
      first: vi.fn(() => /短标题|maxlength|short-title/.test(selector) ? shortTitleInput : editor),
    })),
    keyboard: {
      type: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('channels/publish fillVideoMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('只把视频描述写入视频号页面，不写入内部任务标题', async () => {
    const { fillVideoMetadata } = await import('@electron/platform/channels/publish');
    const page = createPage();

    await fillVideoMetadata(
      page as never,
      '父母的觉醒好书推荐',
      '孩子不需要我们的主张和期望',
      [],
    );

    expect(page.keyboard.type).toHaveBeenCalledTimes(1);
    expect(page.keyboard.type).toHaveBeenCalledWith('孩子不需要我们的主张和期望');
    expect(page.keyboard.type).not.toHaveBeenCalledWith('父母的觉醒好书推荐');
  });

  it('视频描述为空时不使用内部任务标题兜底', async () => {
    const { fillVideoMetadata } = await import('@electron/platform/channels/publish');
    const page = createPage();

    await fillVideoMetadata(page as never, '父母的觉醒好书推荐', undefined, []);

    expect(page.keyboard.type).not.toHaveBeenCalled();
  });

  it('将内部任务标题填写到视频号短标题输入框', async () => {
    const { setShortTitle } = await import('@electron/platform/channels/publish');
    const page = createPage();

    await setShortTitle(page as never, '父母的觉醒好书推荐');

    expect(humanType).toHaveBeenCalledWith(
      expect.stringContaining('短标题'),
      '父母的觉醒好书推荐',
    );
  });

  it('地点为空时点击位置行右侧下拉框并选择不显示位置', async () => {
    const { applyLocation } = await import('@electron/platform/channels/publish');
    const trigger = {
      count: vi.fn().mockResolvedValue(1),
      isVisible: vi.fn().mockResolvedValue(true),
      boundingBox: vi.fn().mockResolvedValue({ x: 10, y: 20, width: 200, height: 40 }),
      click: vi.fn().mockResolvedValue(undefined),
    };
    const hideOption = {
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockResolvedValue(undefined),
    };
    const page = {
      locator: vi.fn(() => ({
        first: vi.fn(() => trigger),
      })),
      getByText: vi.fn(() => ({
        first: vi.fn(() => hideOption),
      })),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };

    const result = await applyLocation(page as never, '');

    expect(result).toBe(true);
    expect(trigger.click).toHaveBeenCalledWith({
      position: { x: 192, y: 20 },
    });
    expect(page.getByText).toHaveBeenCalledWith('不显示位置', { exact: true });
    expect(hideOption.click).toHaveBeenCalled();
  });

  it('严格按主复选框、条款复选框、声明原创按钮的顺序完成原创声明', async () => {
    const { applyOriginalStatement } = await import('@electron/platform/channels/publish');
    const actions: string[] = [];
    let originalChecked = false;
    let agreementChecked = false;
    let dialogVisible = true;

    const originalCheckbox = {
      first: vi.fn(function () { return this; }),
      count: vi.fn().mockResolvedValue(1),
      isVisible: vi.fn().mockResolvedValue(true),
      isChecked: vi.fn(async () => originalChecked),
      check: vi.fn(async () => {
        actions.push('main-checkbox');
        originalChecked = true;
      }),
    };
    const agreementCheckbox = {
      first: vi.fn(function () { return this; }),
      count: vi.fn().mockResolvedValue(1),
      isChecked: vi.fn(async () => agreementChecked),
      check: vi.fn(async () => {
        actions.push('agreement-checkbox');
        agreementChecked = true;
      }),
    };
    const agreementContainer = {
      filter: vi.fn(function () { return this; }),
      first: vi.fn(function () { return this; }),
      count: vi.fn().mockResolvedValue(1),
      isVisible: vi.fn().mockResolvedValue(true),
      locator: vi.fn(() => agreementCheckbox),
    };
    const declareButton = {
      first: vi.fn(function () { return this; }),
      count: vi.fn().mockResolvedValue(1),
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn(async () => {
        actions.push('declare-button');
        dialogVisible = false;
      }),
    };
    const dialog = {
      filter: vi.fn(function () { return this; }),
      first: vi.fn(function () { return this; }),
      waitFor: vi.fn().mockResolvedValue(undefined),
      isVisible: vi.fn(async () => dialogVisible),
      locator: vi.fn(() => agreementContainer),
      getByRole: vi.fn(() => declareButton),
    };
    const page = {
      getByLabel: vi.fn(() => originalCheckbox),
      locator: vi.fn(() => dialog),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };

    const result = await applyOriginalStatement(page as never, true);

    expect(result).toBe(true);
    expect(actions).toEqual([
      'main-checkbox',
      'agreement-checkbox',
      'declare-button',
    ]);
    expect(originalCheckbox.check).toHaveBeenCalledWith({ force: true });
    expect(agreementCheckbox.check).toHaveBeenCalledWith({ force: true });
    expect(dialog.getByRole).toHaveBeenCalledWith('button', {
      name: '声明原创',
      exact: true,
    });
  });
});
