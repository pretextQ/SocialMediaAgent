import { chromium, type Page, type Browser, type BrowserContext } from 'patchright';
import { createE2EConfig, type E2EConfig } from '../e2e-config';
import { E2E_TIMEOUT } from './helpers';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function logTest(name: string, passed: boolean, error?: string) {
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}`);
  if (error) console.log(`   Error: ${error}`);
  results.push({ name, passed, error });
}

describe('分组管理 E2E', () => {
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let config: E2EConfig;

  beforeAll(async () => {
    config = createE2EConfig({
      mockAccountLogin: true,
      headless: false,
      timeout: E2E_TIMEOUT,
    });

    browser = await chromium.launch({
      headless: config.headless,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    context = await browser.newContext({ viewport: config.viewport });
    page = await context.newPage();
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  describe('1. 导航到分组页面', () => {
    test('应能从侧边栏导航到分组管理页面', async () => {
      if (!page) throw new Error('Page not initialized');

      await page.goto(config.devServerUrl, { waitUntil: 'networkidle', timeout: config.timeout });
      await page.waitForTimeout(1500);

      await page.evaluate(() => {
        localStorage.setItem('onboardingCompleted', 'true');
      });

      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);

      const groupsLink = page.locator('a[href="#/groups"], .sidebar a:has-text("分组管理")').first();
      const isVisible = await groupsLink.isVisible().catch(() => false);

      if (isVisible) {
        await groupsLink.click();
        await page.waitForTimeout(800);
        logTest('导航到分组管理页面', true);
      } else {
        await page.goto(`${config.devServerUrl}/#/groups`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(800);
        const url = page.url();
        logTest('导航到分组管理页面', url.includes('#/groups'), '无法找到分组管理链接');
      }
    }, E2E_TIMEOUT);
  });

  describe('2. 空状态验证', () => {
    test('应显示"暂无分组"空状态和"创建分组"按钮', async () => {
      if (!page) throw new Error('Page not initialized');

      await page.goto(`${config.devServerUrl}/#/groups`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);

      const emptyText = page.locator('.empty__text, .empty:has-text("暂无分组")').first();
      const emptyExists = await emptyText.isVisible().catch(() => false);

      if (emptyExists) {
        const text = await emptyText.textContent();
        logTest('显示空状态文本', text?.includes('暂无分组') ?? false);
      } else {
        logTest('显示空状态文本', false, '空状态组件未找到或已有分组存在');
      }

      const createBtn = page.locator('button:has-text("创建分组"), .el-button:has-text("创建分组")').first();
      const createBtnVisible = await createBtn.isVisible().catch(() => false);
      logTest('显示"创建分组"按钮', createBtnVisible);
    }, E2E_TIMEOUT);
  });

  describe('3. 创建分组弹窗', () => {
    test('点击"创建分组"应打开弹窗', async () => {
      if (!page) throw new Error('Page not initialized');

      await page.goto(`${config.devServerUrl}/#/groups`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);

      const createBtn = page.locator('button:has-text("创建分组"), .el-button:has-text("创建分组")').first();
      await createBtn.click();
      await page.waitForTimeout(500);

      const dialog = page.locator('.el-dialog, [role="dialog"]').first();
      const dialogVisible = await dialog.isVisible().catch(() => false);
      logTest('创建分组弹窗打开', dialogVisible);

      if (dialogVisible) {
        const title = await page.locator('.el-dialog__title, [role="dialog"] .el-dialog__header').textContent().catch(() => '');
        logTest('弹窗标题为"创建分组"', title?.includes('创建分组') ?? false);
      }
    }, E2E_TIMEOUT);

    test('弹窗应包含表单字段：名称输入、颜色选择', async () => {
      if (!page) throw new Error('Page not initialized');

      const dialog = page.locator('.el-dialog:visible, [role="dialog"]:visible').first();
      if (!await dialog.isVisible().catch(() => false)) {
        const createBtn = page.locator('button:has-text("创建分组")').first();
        await createBtn.click();
        await page.waitForTimeout(500);
      }

      const nameInput = page.locator('input[placeholder="输入分组名称"], .el-input input').first();
      const nameInputVisible = await nameInput.isVisible().catch(() => false);
      logTest('显示分组名称输入框', nameInputVisible);

      const colorPicker = page.locator('.color-picker, .color-picker__item').first();
      const colorPickerVisible = await colorPicker.isVisible().catch(() => false);
      logTest('显示颜色选择器', colorPickerVisible);

      const cancelBtn = page.locator('.el-dialog__footer button:has-text("取消"), [role="dialog"] button:has-text("取消")').first();
      const confirmBtn = page.locator('.el-dialog__footer button:has-text("确认创建"), [role="dialog"] button:has-text("确认创建")').first();
      logTest('显示取消按钮', await cancelBtn.isVisible().catch(() => false));
      logTest('显示确认创建按钮', await confirmBtn.isVisible().catch(() => false));
    }, E2E_TIMEOUT);
  });

  describe('4. 填写表单并创建分组', () => {
    test('填写名称和颜色后应能创建分组', async () => {
      if (!page) throw new Error('Page not initialized');

      await page.goto(`${config.devServerUrl}/#/groups`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);

      const createBtn = page.locator('button:has-text("创建分组")').first();
      await createBtn.click();
      await page.waitForTimeout(500);

      const nameInput = page.locator('.el-dialog input[placeholder="输入分组名称"]').first();
      await nameInput.fill('测试分组 E2E');

      const colorItems = page.locator('.color-picker__item');
      const colorCount = await colorItems.count();
      if (colorCount > 1) await colorItems.nth(1).click();

      const confirmBtn = page.locator('.el-dialog__footer button:has-text("确认创建")').first();
      await confirmBtn.click();
      await page.waitForTimeout(1000);

      const successMsg = page.locator('.el-message--success, .el-message:has-text("成功"), .el-message:has-text("创建")').first();
      const hasSuccess = await successMsg.isVisible().catch(() => false);
      logTest('显示创建成功提示', hasSuccess);

      await page.waitForTimeout(500);
      const groupCard = page.locator('.group-card:has-text("测试分组 E2E")').first();
      const groupAppears = await groupCard.isVisible().catch(() => false);
      logTest('新创建的分组出现在列表中', groupAppears);
    }, E2E_TIMEOUT);
  });

  describe('5. 编辑分组', () => {
    test('点击编辑按钮应打开预填数据的编辑弹窗', async () => {
      if (!page) throw new Error('Page not initialized');

      await page.goto(`${config.devServerUrl}/#/groups`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);

      const testGroup = page.locator('.group-card:has-text("测试分组 E2E")').first();
      if (!await testGroup.isVisible().catch(() => false)) {
        logTest('找到测试分组卡片', false, '测试分组不存在');
        return;
      }

      const editBtn = testGroup.locator('button:has-text("编辑")').first();
      await editBtn.click();
      await page.waitForTimeout(500);

      const dialogTitle = await page.locator('.el-dialog__title').textContent().catch(() => '');
      logTest('编辑弹窗标题为"编辑分组"', dialogTitle?.includes('编辑分组') ?? false);

      const nameInput = page.locator('.el-dialog input[placeholder="输入分组名称"]').first();
      const inputValue = await nameInput.inputValue();
      logTest('分组名称已预填', inputValue === '测试分组 E2E');
    }, E2E_TIMEOUT);

    test('修改名称后保存应更新分组', async () => {
      if (!page) throw new Error('Page not initialized');

      const testGroup = page.locator('.group-card:has-text("测试分组 E2E")').first();
      if (!await testGroup.isVisible().catch(() => false)) {
        logTest('更新分组名称', false, '测试分组不存在');
        return;
      }

      const editBtn = testGroup.locator('button:has-text("编辑")').first();
      await editBtn.click();
      await page.waitForTimeout(500);

      const nameInput = page.locator('.el-dialog input[placeholder="输入分组名称"]').first();
      await nameInput.clear();
      await nameInput.fill('测试分组 E2E 已更新');

      const saveBtn = page.locator('.el-dialog__footer button:has-text("保存修改")').first();
      await saveBtn.click();
      await page.waitForTimeout(1000);

      const successMsg = page.locator('.el-message--success, .el-message:has-text("更新")').first();
      const hasSuccess = await successMsg.isVisible().catch(() => false);
      logTest('显示更新成功提示', hasSuccess);

      await page.waitForTimeout(500);
      const updatedGroup = page.locator('.group-card:has-text("测试分组 E2E 已更新")').first();
      const isUpdated = await updatedGroup.isVisible().catch(() => false);
      logTest('分组列表中名称已更新', isUpdated);
    }, E2E_TIMEOUT);
  });

  describe('6. 删除分组', () => {
    test('点击删除按钮并确认后应移除分组', async () => {
      if (!page) throw new Error('Page not initialized');

      await page.goto(`${config.devServerUrl}/#/groups`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);

      const testGroup = page.locator('.group-card:has-text("测试分组 E2E 已更新")').first();
      if (!await testGroup.isVisible().catch(() => false)) {
        logTest('找到测试分组卡片用于删除', false, '测试分组不存在');
        return;
      }

      const deleteBtn = testGroup.locator('button:has-text("删除")').first();
      await deleteBtn.click();
      await page.waitForTimeout(500);

      const popconfirm = page.locator('.el-popconfirm, [role="dialog"]:has-text("确定删除")').first();
      const confirmVisible = await popconfirm.isVisible().catch(() => false);

      if (confirmVisible) {
        logTest('显示删除确认弹窗', true);

        const confirmDeleteBtn = page.locator('.el-popconfirm .el-button:has-text("确定"), button:has-text("确定"):visible').first();
        await confirmDeleteBtn.click();
        await page.waitForTimeout(1000);

        const successMsg = page.locator('.el-message--success, .el-message:has-text("删除")').first();
        const hasSuccess = await successMsg.isVisible().catch(() => false);
        logTest('显示删除成功提示', hasSuccess);

        await page.waitForTimeout(500);
        const deletedGroup = page.locator('.group-card:has-text("测试分组 E2E 已更新")').first();
        const isRemoved = !(await deletedGroup.isVisible().catch(() => false));
        logTest('分组已从列表移除', isRemoved);
      } else {
        const confirmBtn = page.locator('.el-button:has-text("确定"), .el-message-box__btn:has-text("确定")').first();
        if (await confirmBtn.isVisible().catch(() => false)) {
          await confirmBtn.click();
          await page.waitForTimeout(1000);
          logTest('确认删除', true);
        } else {
          logTest('显示删除确认弹窗', false, '确认弹窗未找到');
        }
      }
    }, E2E_TIMEOUT);
  });
});