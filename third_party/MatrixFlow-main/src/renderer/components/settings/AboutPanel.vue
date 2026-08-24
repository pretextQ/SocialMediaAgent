<template>
  <div class="about-panel">
    <div class="about-hero">
      <div class="about-hero__icon">M</div>
      <div class="about-hero__text">
        <div class="about-hero__name">MatrixFlow</div>
        <div class="about-hero__tagline">AI Native 多平台矩阵式内容分发系统</div>
      </div>
    </div>

    <div class="about-info-card">
      <div class="about-info-row">
        <div class="about-info-row__label">版本</div>
        <div class="about-info-row__value">{{ version }}</div>
      </div>
      <div class="about-info-row">
        <div class="about-info-row__label">构建日期</div>
        <div class="about-info-row__value">{{ buildDate }}</div>
      </div>
      <div class="about-info-row">
        <div class="about-info-row__label">Electron</div>
        <div class="about-info-row__value">{{ electronVersion }}</div>
      </div>
      <div class="about-info-row">
        <div class="about-info-row__label">Chromium</div>
        <div class="about-info-row__value">{{ chromeVersion }}</div>
      </div>
      <div class="about-info-row">
        <div class="about-info-row__label">数据目录</div>
        <div class="about-info-row__value about-info-row__mono">{{ dataDir }}</div>
      </div>
    </div>

    <div class="about-links">
      <el-button @click="openLink('https://github.com/matrixflow')">
        <el-icon><Link /></el-icon>
        GitHub
      </el-button>
      <el-button @click="openLink('https://matrixflow.dev/docs')">
        <el-icon><Document /></el-icon>
        文档
      </el-button>
      <el-button @click="openLink('https://matrixflow.dev/changelog')">
        <el-icon><Memo /></el-icon>
        更新日志
      </el-button>
    </div>

    <div class="about-copyright">
      &copy; {{ new Date().getFullYear() }} MatrixFlow. All rights reserved.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Link, Document, Memo } from '@element-plus/icons-vue';

const version = ref('');
const buildDate = ref('');
const electronVersion = ref('');
const chromeVersion = ref('');
const dataDir = ref('');

onMounted(async () => {
  if (!window.matrixflow) return;
  try {
    const [ver, build, electron, chrome, dir] = await Promise.all([
      window.matrixflow.app.getVersion(),
      window.matrixflow.app.getBuildDate(),
      window.matrixflow.app.getElectronVersion(),
      window.matrixflow.app.getChromeVersion(),
      window.matrixflow.settings.get('dataDir'),
    ]);
    version.value = ver || '0.0.0';
    buildDate.value = build || '';
    electronVersion.value = electron || '';
    chromeVersion.value = chrome || '';
    dataDir.value = String(dir || '');
  } catch {
    /* ignore */
  }
});

function openLink(url: string) {
  window.open(url, '_blank');
}
</script>

<style scoped>
.about-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-8) 0;
}

.about-hero {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.about-hero__icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-xl);
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  box-shadow: var(--shadow-md);
  flex-shrink: 0;
}

.about-hero__text {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.about-hero__name {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  line-height: 1.2;
}

.about-hero__tagline {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.about-info-card {
  width: 100%;
  max-width: 480px;
  background: var(--color-bg-page, #f8fafc);
  border: 1px solid var(--color-border-light, #f1f5f9);
  border-radius: var(--radius-lg);
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
}

.about-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  transition: background var(--transition-fast);
}

.about-info-row:hover {
  background: var(--color-bg-card);
}

.about-info-row__label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-medium);
}

.about-info-row__value {
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-semibold);
}

.about-info-row__mono {
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-normal);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.about-links {
  display: flex;
  gap: var(--space-3);
}

.about-copyright {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
}
</style>
