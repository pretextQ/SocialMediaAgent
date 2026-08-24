<template>
  <div class="page-settings">
    <h2 class="page-settings__title">设置</h2>

    <el-tabs v-model="activeTab" class="settings-tabs">
      <el-tab-pane label="基本设置" name="general">
        <div class="settings-card">
          <div class="theme-section">
            <div class="theme-section__label">外观</div>
            <el-radio-group
              v-model="settings.settings.theme"
              size="large"
              class="theme-selector"
              @change="(v: string | number | boolean) => onThemeChange(v as AppSettings['theme'])"
            >
              <el-radio-button value="light">
                <div class="theme-option">
                  <el-icon :size="18"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M512 64c-247.4 0-448 200.6-448 448s200.6 448 448 448 448-200.6 448-448-200.6-448-448-448zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z" fill="currentColor"/><path d="M512 192v640M192 512h640" stroke="currentColor" stroke-width="40" stroke-linecap="round"/></svg></el-icon>
                  <span>浅色</span>
                </div>
              </el-radio-button>
              <el-radio-button value="dark">
                <div class="theme-option">
                  <el-icon :size="18"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M582.5 382.5c-99.6 0-180.5 80.9-180.5 180.5s80.9 180.5 180.5 180.5c11.7 0 23.2-1.1 34.3-3.3-32.5 23.1-72.3 36.8-115.3 36.8-110.5 0-200-89.5-200-200s89.5-200 200-200c43 0 82.8 13.7 115.3 36.8-11.1-2.2-22.6-3.3-34.3-3.3z" fill="currentColor"/><path d="M512 64v64M512 896v64M896 512h64M64 512h64M796.2 227.8l-45.3 45.3M273.1 750.9l-45.3 45.3M796.2 796.2l-45.3-45.3M273.1 273.1l-45.3-45.3" stroke="currentColor" stroke-width="40" stroke-linecap="round"/></svg></el-icon>
                  <span>深色</span>
                </div>
              </el-radio-button>
              <el-radio-button value="auto">
                <div class="theme-option">
                  <el-icon :size="18"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z" fill="currentColor"/><path d="M512 140v772M140 512h772" stroke="currentColor" stroke-width="30"/></svg></el-icon>
                  <span>跟随系统</span>
                </div>
              </el-radio-button>
            </el-radio-group>
          </div>

          <el-divider content-position="left">任务设置</el-divider>

          <el-form label-width="140px" class="settings-form">
            <el-form-item label="并发任务数">
              <el-input-number
                v-model="settings.settings.concurrentTasks"
                :min="1"
                :max="10"
                @change="(v: number | undefined) => v && settings.updateSetting('concurrentTasks', v)"
              />
            </el-form-item>

            <el-form-item label="重试次数">
              <el-input-number
                v-model="settings.settings.retryLimit"
                :min="0"
                :max="10"
                @change="(v: number | undefined) => v && settings.updateSetting('retryLimit', v)"
              />
            </el-form-item>

            <el-divider content-position="left">Cookie 检测</el-divider>

            <el-form-item label="自动检测 Cookie">
              <el-switch
                v-model="settings.settings.autoCheckCookie"
                @change="(v: boolean) => settings.updateSetting('autoCheckCookie', v)"
              />
            </el-form-item>

            <el-form-item v-if="settings.settings.autoCheckCookie" label="检测间隔（分钟）">
              <el-input-number
                v-model="settings.settings.cookieCheckInterval"
                :min="10"
                :max="1440"
                :step="10"
                @change="(v: number | undefined) => v && settings.updateSetting('cookieCheckInterval', v)"
              />
            </el-form-item>

            <el-divider content-position="left">素材存储</el-divider>

            <el-form-item label="素材库地址">
              <el-input
                v-model="materialLibraryPath"
                :placeholder="materialLibraryPathDefault"
                @change="(v: string) => saveMaterialLibraryPath(v)"
              >
                <template #append>
                  <el-button @click="selectMaterialLibraryPath">选择</el-button>
                </template>
              </el-input>
              <div class="settings-hint">留空则使用默认路径: {{ materialLibraryPathDefault }}</div>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <el-tab-pane label="浏览器配置" name="browser">
        <div class="settings-card">
          <div class="browser-mode-selector">
            <div class="browser-mode-selector__label">启动模式</div>
            <el-radio-group
              v-model="settings.settings.browserMode"
              size="large"
              class="browser-mode-selector__group"
              @change="(v: string | number | boolean) => onBrowserModeChange(v as AppSettings['browserMode'])"
            >
              <el-radio-button value="embedded">
                内嵌浏览器
              </el-radio-button>
              <el-radio-button value="external_chrome">
                外置 Chrome
              </el-radio-button>
              <el-radio-button value="external_fingerprint">
                外置指纹浏览器
              </el-radio-button>
            </el-radio-group>
          </div>

          <div class="browser-mode-section">
            <div v-if="settings.settings.browserMode === 'embedded'" class="mode-config-panel">
              <div class="mode-config-panel__header">
                <el-icon :size="18"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm193.5 301.7l-210.6 292a31.8 31.8 0 01-51.7 0L318.5 484.9c-3.8-5.3 0-12.7 6.5-12.7h46.9c10.3 0 19.9 5 25.9 13.3l71.2 99.8 157.2-218c6-8.4 15.7-13.3 25.9-13.3H699c6.5 0 9.9 7.4 6.5 12.7z" fill="currentColor"/></svg></el-icon>
                <span>内嵌浏览器</span>
              </div>
              <div class="config-info">
                <div class="config-info__icon"><el-icon :size="16"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm32 664c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V456c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v272zm-32-344c-26.5 0-48-21.5-48-48s21.5-48 48-48 48 21.5 48 48-21.5 48-48 48z" fill="currentColor"/></svg></el-icon></div>
                <div class="config-info__body">
                  <div class="config-info__title">无需额外配置，开箱即用</div>
                  <div class="config-info__desc">内嵌 Patchright 使用本地真实指纹，防自动化检测能力强（CreepJS: 0% headless）。如需自定义 Canvas/WebGL 指纹，需通过 init scripts 配置。建议高风控平台（小红书、抖音）升级到指纹浏览器。</div>
                </div>
              </div>
            </div>

            <div v-if="settings.settings.browserMode === 'external_chrome'" class="mode-config-panel">
              <div class="mode-config-panel__header">
                <el-icon :size="18"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M928 160H96c-17.7 0-32 14.3-32 32v608c0 17.7 14.3 32 32 32h832c17.7 0 32-14.3 32-32V192c0-17.7-14.3-32-32-32zM338 620c-60.9 0-110-49.1-110-110s49.1-110 110-110 110 49.1 110 110-49.1 110-110 110zm202-26h-56c-4.4 0-8-3.6-8-8v-44c0-4.4 3.6-8 8-8h56c4.4 0 8 3.6 8 8v44c0 4.4-3.6 8-8 8zm0-116h-56c-4.4 0-8-3.6-8-8v-44c0-4.4 3.6-8 8-8h56c4.4 0 8 3.6 8 8v44c0 4.4-3.6 8-8 8zm190 116h-56c-4.4 0-8-3.6-8-8v-44c0-4.4 3.6-8 8-8h56c4.4 0 8 3.6 8 8v44c0 4.4-3.6 8-8 8zm0-116h-56c-4.4 0-8-3.6-8-8v-44c0-4.4 3.6-8 8-8h56c4.4 0 8 3.6 8 8v44c0 4.4-3.6 8-8 8z" fill="currentColor"/></svg></el-icon>
                <span>Chrome 配置</span>
              </div>
              <div class="config-info">
                <div class="config-info__icon"><el-icon :size="16"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm32 664c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V456c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v272zm-32-344c-26.5 0-48-21.5-48-48s21.5-48 48-48 48 21.5 48 48-21.5 48-48 48z" fill="currentColor"/></svg></el-icon></div>
                <div class="config-info__body">
                  <div class="config-info__title">建议安装指纹修改插件</div>
                  <div class="config-info__desc">外置 Chrome 依赖浏览器插件来修改指纹参数。安装以下插件可有效降低平台关联风险：</div>
                  <div class="config-info__links">
                    <el-link type="primary" @click.prevent="openInChrome('https://chromewebstore.google.com/detail/webrtc-network-limiter/npeicpdbkakmehahjeeohfdhnlpdklia')" underline="never">WebRTC Leak Prevent →</el-link>
                  </div>
                </div>
              </div>
              <el-form label-width="120px" class="settings-form">
                <el-form-item label="Chrome 路径">
                  <el-input
                    v-model="settings.settings.chromePath"
                    placeholder="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
                    @change="(v: string) => settings.updateSetting('chromePath', v)"
                  >
                    <template #append>
                      <el-button @click="selectChromePath">选择</el-button>
                    </template>
                  </el-input>
                </el-form-item>
                <el-form-item label="CDP 端点">
                  <el-input
                    v-model="settings.settings.chromeCdpEndpoint"
                    placeholder="ws://127.0.0.1:9222（留空则直接启动 Chrome）"
                    @change="(v: string) => settings.updateSetting('chromeCdpEndpoint', v)"
                  />
                </el-form-item>
              </el-form>
            </div>

            <div v-if="settings.settings.browserMode === 'external_fingerprint'" class="mode-config-panel">
              <div class="mode-config-panel__header">
                <el-icon :size="18"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h736c17.7 0 32-14.3 32-32V144c0-17.7-14.3-32-32-32zM401.3 651h-34.5c-3.8 0-6.9-2.7-7.8-6.4l-18.1-71.4h-84.6l-18.1 71.4c-1 3.7-4 6.4-7.8 6.4h-34.5c-4.9 0-8.5-4.6-7.3-9.3l69.3-265.7c1-3.7 4-6.3 7.8-6.3h41.4c3.8 0 6.9 2.6 7.8 6.3l69.3 265.7c1.2 4.7-2.4 9.3-7.3 9.3zm327.2 0H488c-4.4 0-8-3.6-8-8v-32c0-4.4 3.6-8 8-8h120.3L493 414.4c-2.3-3.2-1.8-7.6 1-10.3l25.5-25.5c3.5-3.5 9.2-3 12 1l119.7 164V307c0-4.4 3.6-8 8-8h33.8c4.4 0 8 3.6 8 8v336c0 4.4-3.6 8-8 8z" fill="currentColor"/></svg></el-icon>
                <span>指纹浏览器配置</span>
                <el-link
                  type="primary"
                  @click.prevent="openInChrome('https://github.com/AdrYfish/fingerprint-chromium')"
                  underline="never"
                  class="mode-config-panel__link"
                >
                  下载指纹浏览器 →
                </el-link>
              </div>
              <div class="config-info">
                <div class="config-info__icon"><el-icon :size="16"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm32 664c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V456c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v272zm-32-344c-26.5 0-48-21.5-48-48s21.5-48 48-48 48 21.5 48 48-21.5 48-48 48z" fill="currentColor"/></svg></el-icon></div>
                <div class="config-info__body">
                  <div class="config-info__title">需要先下载指纹浏览器</div>
                  <div class="config-info__desc">指纹浏览器基于 Chromium 定制，支持通过 <code>--fingerprint</code> 参数注入浏览器指纹。请先下载并安装，然后在下方配置路径。</div>
                </div>
              </div>
              <el-form label-width="120px" class="settings-form">
                <el-form-item label="浏览器路径">
                  <el-input
                    v-model="settings.settings.fingerprintBrowserPath"
                    placeholder="选择 fingerprint-chromium 可执行文件"
                    @change="(v: string) => settings.updateSetting('fingerprintBrowserPath', v)"
                  >
                    <template #append>
                      <el-button @click="selectFingerprintPath">选择</el-button>
                    </template>
                  </el-input>
                </el-form-item>
                <el-form-item label="CDP 端点">
                  <el-input
                    v-model="settings.settings.fingerprintCdpEndpoint"
                    placeholder="ws://127.0.0.1:9222（留空则直接启动指纹浏览器）"
                    @change="(v: string) => settings.updateSetting('fingerprintCdpEndpoint', v)"
                  />
                </el-form-item>
              </el-form>
              <p class="config-footnote">请先启动指纹浏览器并开启远程调试端口，MatrixFlow 将通过 CDP 协议接管。</p>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="指纹配置" name="fingerprint">
        <div class="settings-card">
          <FingerprintSettings />
        </div>
      </el-tab-pane>

      <el-tab-pane label="代理设置" name="proxy">
        <div class="settings-card">
          <ProxySettings />
        </div>
      </el-tab-pane>

      <el-tab-pane label="平台配置" name="platform">
        <div class="settings-card">
          <PlatformSettings />
        </div>
      </el-tab-pane>

      <el-tab-pane label="AI 风险检测" name="ai-risk">
        <div class="settings-card">
          <AIRiskSettings />
        </div>
      </el-tab-pane>

      <el-tab-pane label="License" name="license">
        <div class="settings-card">
          <LicenseSettings />
        </div>
      </el-tab-pane>

      <el-tab-pane label="通知设置" name="notification">
        <div class="settings-card">
          <NotificationSettings />
        </div>
      </el-tab-pane>

      <el-tab-pane label="数据管理" name="data">
        <div class="settings-card">
          <DataManagementSettings />
        </div>
      </el-tab-pane>

      <el-tab-pane label="调试模式" name="debug">
        <div class="settings-card">
          <div class="debug-mode-section">
            <div class="debug-mode-section__header">
              <el-icon :size="18"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372zm56-532h32v240h-32V352zm-96 0h32v240h-32V352zm-96 0h32v240h-32V352z" fill="currentColor"/></svg></el-icon>
              <span>调试模式</span>
            </div>
            <div class="config-info" style="margin-bottom: 16px;">
              <div class="config-info__icon"><el-icon :size="16"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm32 664c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V456c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v272zm-32-344c-26.5 0-48-21.5-48-48s21.5-48 48-48 48 21.5 48 48-21.5 48-48 48z" fill="currentColor"/></svg></el-icon></div>
              <div class="config-info__body">
                <div class="config-info__title">记录每步截图与 HTML 快照</div>
                <div class="config-info__desc">调试模式开启后，发布流程的每一步都会自动截图并保存 HTML 快照，方便排查平台改版后的选择器问题。截图默认 7 天后自动清理。</div>
              </div>
            </div>
            <el-form label-width="140px" class="settings-form">
              <el-form-item label="调试模式">
                <el-switch
                  v-model="settings.settings.debugMode"
                  @change="(v: boolean) => onDebugModeChange(v)"
                />
              </el-form-item>
              <el-form-item label="数据保留天数">
                <el-select
                  v-model="settings.settings.debugRetentionDays"
                  :disabled="!settings.settings.debugMode"
                  @change="(v: number) => settings.updateSetting('debugRetentionDays', v)"
                >
                  <el-option :value="7" label="7 天" />
                  <el-option :value="30" label="30 天" />
                  <el-option :value="90" label="90 天" />
                </el-select>
              </el-form-item>
            </el-form>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="关于" name="about">
        <div class="settings-card">
          <AboutPanel />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useSettingsStore } from '@/renderer/stores/settings';
import type { AppSettings } from '@/renderer/stores/settings';
import AIRiskSettings from '@/renderer/components/settings/AIRiskSettings.vue';
import FingerprintSettings from '@/renderer/components/settings/FingerprintSettings.vue';
import ProxySettings from '@/renderer/components/settings/ProxySettings.vue';
import PlatformSettings from '@/renderer/components/settings/PlatformSettings.vue';
import LicenseSettings from '@/renderer/components/settings/LicenseSettings.vue';
import NotificationSettings from '@/renderer/components/settings/NotificationSettings.vue';
import DataManagementSettings from '@/renderer/components/settings/DataManagementSettings.vue';
import AboutPanel from '@/renderer/components/settings/AboutPanel.vue';

const settings = useSettingsStore();
const activeTab = ref('general');
const materialLibraryPath = ref('');
const materialLibraryPathDefault = ref('');

onMounted(async () => {
  settings.fetchSettings();
  await loadMaterialLibraryPath();
});

async function onBrowserModeChange(mode: AppSettings['browserMode']) {
  await settings.updateSetting('browserMode', mode);
}

async function onDebugModeChange(enabled: boolean) {
  if (enabled) {
    const confirmed = await new Promise<boolean>((resolve) => {
      ElMessageBox.confirm(
        '调试模式会记录每步截图与 HTML，可能包含敏感信息（如账号 ID、手机号）。确认开启？',
        '确认开启调试模式',
        {
          confirmButtonText: '确认开启',
          cancelButtonText: '取消',
          type: 'warning',
        },
      ).then(() => resolve(true)).catch(() => resolve(false));
    });
    if (!confirmed) {
      settings.updateSetting('debugMode', false);
      return;
    }
  }
  await settings.updateSetting('debugMode', enabled);
}

async function selectChromePath() {
  const filePath = await window.matrixflow.dialog.openFile({
    title: '选择 Chrome 浏览器',
    properties: ['openFile'],
    filters: [{ name: '应用程序', extensions: ['app', 'exe'] }],
  });
  if (filePath && typeof filePath === 'string') {
    settings.updateSetting('chromePath', filePath);
  }
}

async function selectFingerprintPath() {
  const filePath = await window.matrixflow.dialog.openFile({
    title: '选择指纹浏览器',
    properties: ['openFile'],
    filters: [{ name: '应用程序', extensions: ['app', 'exe'] }],
  });
  if (filePath && typeof filePath === 'string') {
    settings.updateSetting('fingerprintBrowserPath', filePath);
  }
}

async function openInChrome(url: string) {
  const result = await window.matrixflow.browser.openUrl(url);
  if (!result.success) {
    ElMessage.warning(result.message || 'Chrome 浏览器路径未配置，请在系统设置中配置');
  }
}

function onThemeChange(theme: AppSettings['theme']) {
  settings.updateSetting('theme', theme);
  applyTheme(theme);
}

function applyTheme(theme: AppSettings['theme']) {
  const html = document.documentElement;
  const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (isDark) {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }
}

async function loadMaterialLibraryPath() {
  if (!window.matrixflow?.material) return;
  const defaultResult = await window.matrixflow.material.getLibraryPath();
  if (defaultResult.success && defaultResult.data) {
    materialLibraryPathDefault.value = defaultResult.data;
  }
  const saved = await window.matrixflow.settings.get('materialLibraryPath');
  if (saved) {
    materialLibraryPath.value = saved as string;
  }
}

async function selectMaterialLibraryPath() {
  const dirPath = await window.matrixflow.dialog.openFile({
    title: '选择素材库目录',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (dirPath && typeof dirPath === 'string') {
    materialLibraryPath.value = dirPath;
    await saveMaterialLibraryPath(dirPath);
  }
}

async function saveMaterialLibraryPath(path: string) {
  if (!window.matrixflow?.material) return;
  const result = await window.matrixflow.material.setLibraryPath(path);
  if (result.success) {
    await window.matrixflow.settings.set('materialLibraryPath', path);
    ElMessage.success('素材库路径已更新');
  } else {
    ElMessage.error(result.message || '设置素材库路径失败');
  }
}

onMounted(() => {
  settings.fetchSettings().then(() => {
    applyTheme(settings.settings.theme);
  });

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', (e) => {
    if (settings.settings.theme === 'auto') {
      applyTheme('auto');
    }
  });
});
</script>

<style scoped>
.page-settings {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.page-settings__title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0;
  padding: var(--space-4) var(--space-4) 0 var(--space-4);
}

.settings-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0 var(--space-4) var(--space-4) var(--space-4);
}

.settings-tabs :deep(.el-tabs__header) {
  margin-bottom: var(--space-4);
  flex-shrink: 0;
}

.settings-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow-y: auto;
}

.settings-card {
  flex: 1;
  background: var(--color-bg-card);
  border-radius: var(--border-radius-md);
  padding: var(--space-6);
  box-shadow: var(--shadow-sm);
  overflow-y: auto;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.settings-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  margin: var(--space-1) 0 0 0;
  line-height: 1.5;
}

.browser-mode-selector {
  margin-bottom: var(--space-6);
}

.browser-mode-selector__label {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: var(--space-4);
}

.browser-mode-selector__group {
  display: flex;
  gap: var(--space-3);
}

.browser-mode-selector__group :deep(.el-radio-button) {
  flex: 1;
}

.browser-mode-selector__group :deep(.el-radio-button__inner) {
  width: 100%;
  padding: var(--space-4) var(--space-5);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  border-radius: var(--radius-lg) !important;
  border: 2px solid var(--color-border) !important;
  box-shadow: none;
  transition: all var(--transition-fast);
}

.browser-mode-selector__group :deep(.el-radio-button__inner:hover) {
  border-color: var(--color-primary-light) !important;
  color: var(--color-primary);
}

.browser-mode-selector__group :deep(.el-radio-button.is-active .el-radio-button__inner) {
  border-color: var(--color-primary) !important;
  background: var(--color-primary-lighter);
  color: var(--color-primary);
  box-shadow: var(--shadow-focus);
}

.browser-mode-section {
  margin-top: var(--space-5);
}

.mode-status {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  padding: var(--space-5);
  border-radius: var(--radius-lg);
  border: 1px solid transparent;
}

.mode-status--success {
  background: var(--color-success-light, #d1fae5);
  border-color: var(--color-success, #10b981);
}

.mode-status--info {
  background: var(--color-primary-lighter, #dbeafe);
  border-color: var(--color-primary-light, #3b82f6);
}

.mode-status--info .mode-status__icon {
  background: var(--color-primary, #2563eb);
}

.mode-status__icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  color: #fff;
}

.mode-status--success .mode-status__icon {
  background: var(--color-success, #10b981);
}

.mode-status__content {
  flex: 1;
  min-width: 0;
}

.mode-status__title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: var(--space-1);
}

.mode-status__desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.mode-config-panel {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  box-shadow: var(--shadow-sm);
}

.mode-config-panel__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-border-light);
}

.mode-config-panel__header .el-icon {
  color: var(--color-primary);
}

.mode-config-panel__link {
  margin-left: auto;
  font-size: var(--font-size-sm);
}

.config-info {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-4);
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  border-left: 3px solid var(--color-primary);
}

.config-info__icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary-lighter);
  border-radius: var(--radius-md);
  color: var(--color-primary);
}

.config-info__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.config-info__title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.config-info__desc {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.config-info__desc code {
  background: var(--color-bg-page);
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-2xs);
  border: 1px solid var(--color-border);
  color: var(--color-text-regular);
}

.config-info__links {
  display: flex;
  gap: var(--space-4);
  margin-top: var(--space-1);
}

.config-info__links .el-link {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.mode-config-panel .settings-form {
  margin-top: 0;
}

.mode-config-panel .settings-form .el-form-item {
  margin-bottom: var(--space-4);
}

.mode-config-panel .settings-form .el-form-item:last-child {
  margin-bottom: 0;
}

.config-footnote {
  margin: 0;
  font-size: var(--font-size-2xs);
  color: var(--color-text-placeholder);
  line-height: 1.5;
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border-light);
}

.theme-section {
  margin-bottom: var(--space-6);
}

.theme-section__label {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: var(--space-4);
}

.theme-selector {
  display: flex;
  gap: var(--space-3);
}

.theme-selector :deep(.el-radio-button) {
  flex: 1;
}

.theme-selector :deep(.el-radio-button__inner) {
  width: 100%;
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius-lg) !important;
  border: 2px solid var(--color-border) !important;
  box-shadow: none;
  transition: all var(--transition-fast);
}

.theme-selector :deep(.el-radio-button__inner:hover) {
  border-color: var(--color-primary-light) !important;
  color: var(--color-primary);
}

.theme-selector :deep(.el-radio-button.is-active .el-radio-button__inner) {
  border-color: var(--color-primary) !important;
  background: var(--color-primary-lighter);
  color: var(--color-primary);
  box-shadow: var(--shadow-focus);
}

.theme-option {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
}
</style>
