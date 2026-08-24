<template>
  <div class="main-layout">
    <TwoLevelSidebar ref="sidebarRef" />
    <div class="main-layout__body">
      <!-- macOS traffic lights spacer for right panel -->
      <div class="main-layout__titlebar">
        <span class="main-layout__titlebar-text">MatrixFlow - AI Native 矩阵发布系统</span>
      </div>
      <Header />
      <main class="main-layout__content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import TwoLevelSidebar from '@/renderer/components/TwoLevelSidebar.vue';
import Header from '@/renderer/components/Header.vue';
import type { NavItem } from '@/renderer/components/TwoLevelSidebar.vue';

const route = useRoute();
const sidebarRef = ref<InstanceType<typeof TwoLevelSidebar> | null>(null);

const subItems = computed<NavItem[]>(() => {
  return (sidebarRef.value?.activeSubItems as NavItem[]) ?? [];
});
</script>

<style scoped>
.main-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.main-layout__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* macOS traffic lights spacer with app name */
.main-layout__titlebar {
  height: 38px;
  flex-shrink: 0;
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border-light);
  position: relative;
  z-index: var(--z-header);
}

.main-layout__titlebar-text {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-semibold);
  white-space: nowrap;
}

.main-layout__content {
  flex: 1;
  padding: var(--space-6);
  overflow-y: auto;
  background: var(--color-bg-page);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-fast);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
