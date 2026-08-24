import { chromium, type Page, type Browser, type BrowserContext } from 'patchright';
import { createE2EConfig, type E2EConfig } from '../e2e-config';
import {
  setupE2EEnvironment,
  mockAccountLogin,
  getMockAccount
} from './helpers';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function logTest(name: string, passed: boolean, error?: string) {
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}`);
  if (error) {
    console.log(`   Error: ${error}`);
  }
  results.push({ name, passed, error });
}

async function runE2ETests() {
  const config = createE2EConfig({
    mockAccountLogin: true,
    headless: false,
    timeout: 30000,
  });

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;

  try {
    console.log('🚀 启动 E2E 测试...');
    console.log(`📋 配置: mockAccountLogin=${config.mockAccountLogin}`);

    browser = await chromium.launch({
      headless: config.headless,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    context = await browser.newContext({
      viewport: config.viewport,
    });

    page = await context.newPage();

    console.log('\n📡 访问开发服务器...');
    await page.goto(config.devServerUrl, { waitUntil: 'networkidle', timeout: config.timeout });
    await page.waitForTimeout(2000);

    console.log('\n📋 测试 1: 设置 E2E 环境');
    try {
      await setupE2EEnvironment(page, config);
      logTest('E2E 环境设置', true);
    } catch (error) {
      logTest('E2E 环境设置', false, String(error));
    }

    console.log('\n📋 测试 2: 验证主页面加载');
    try {
      const url = page.url();
      const isMainPage = url.includes('#/') || url === config.devServerUrl + '/';
      logTest('主页面加载', isMainPage);
    } catch (error) {
      logTest('主页面加载', false, String(error));
    }

    console.log('\n📋 测试 2: Mock 账号登录');
    try {
      const mockAccount = getMockAccount('douyin');
      await mockAccountLogin(page, 'douyin');
      logTest('Mock 账号创建', true);
    } catch (error) {
      logTest('Mock 账号创建', false, String(error));
    }

    console.log('\n📋 测试 3: 验证主页面加载');
    try {
      const url = page.url();
      const isMainPage = url.includes('#/') || url === config.devServerUrl + '/';
      logTest('主页面加载', isMainPage);
    } catch (error) {
      logTest('主页面加载', false, String(error));
    }

    console.log('\n📋 测试 4: 导航侧边栏');
    try {
      const sidebar = await page.locator('.sidebar').isVisible().catch(() => false);
      logTest('侧边栏可见', sidebar);
    } catch (error) {
      logTest('侧边栏可见', false, String(error));
    }

    console.log('\n📋 测试 5: 页面导航');
    try {
      const accountsLink = page.locator('a[href="#/accounts"], a:has-text("账号")').first();
      const accountsVisible = await accountsLink.isVisible().catch(() => false);
      
      if (accountsVisible) {
        await accountsLink.click();
        await page.waitForTimeout(500);
        logTest('导航到账号页面', true);
      } else {
        logTest('导航到账号页面', false, '链接不可见');
      }
    } catch (error) {
      logTest('导航到账号页面', false, String(error));
    }

    console.log('\n📋 测试 6: 截图验证');
    try {
      await page.screenshot({ path: '/tmp/e2e-test-final.png', fullPage: true });
      logTest('截图保存', true);
    } catch (error) {
      logTest('截图保存', false, String(error));
    }

    console.log('\n📊 测试结果汇总');
    console.log('='.repeat(50));
    
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const total = results.length;

    console.log(`总计: ${total} 项`);
    console.log(`通过: ${passed} 项 ✅`);
    console.log(`失败: ${failed} 项 ❌`);
    console.log(`通过率: ${((passed / total) * 100).toFixed(1)}%`);

    if (failed > 0) {
      console.log('\n❌ 失败项:');
      results.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.name}: ${r.error || '未知错误'}`);
      });
    }

    return { success: failed === 0, passed, failed, total };

  } catch (error) {
    console.error('\n💥 E2E 测试执行失败:', error);
    
    if (page) {
      await page.screenshot({ path: '/tmp/e2e-test-error.png', fullPage: true });
    }
    
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

runE2ETests()
  .then((result) => {
    console.log('\n🎉 E2E 测试完成!');
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    console.error('\n💥 E2E 测试异常:', error);
    process.exit(1);
  });
