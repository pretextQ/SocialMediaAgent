<template>
  <aside class="sidebar" :class="{ 'sidebar--collapsed': collapsed }">
    <!-- macOS traffic lights spacer -->
    <div class="sidebar__traffic-lights" />

    <!-- Brand area -->
    <div class="sidebar__brand">
      <div class="sidebar__logo">M</div>
      <transition name="fade-text">
        <span v-if="!collapsed" class="sidebar__title">MatrixFlow</span>
      </transition>
    </div>

    <!-- Main nav -->
    <nav class="sidebar__nav">
      <div
        v-for="item in menuItems"
        :key="item.id"
        class="sidebar__nav-item"
        :class="{
          'sidebar__nav-item--active': isItemActive(item),
          'sidebar__nav-item--expanded': expandedId === item.id,
        }"
        @click="handleItemClick(item)"
      >
        <el-icon :size="20"><component :is="item.icon" /></el-icon>
        <transition name="fade-text">
          <span v-if="!collapsed" class="sidebar__nav-label">{{ item.label }}</span>
        </transition>
      </div>
    </nav>

    <!-- Footer toggle -->
    <div class="sidebar__footer">
      <button class="sidebar__toggle" @click="collapsed = !collapsed">
        <el-icon :size="18">
          <Fold v-if="!collapsed" />
          <Expand v-else />
        </el-icon>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  HomeFilled,
  Monitor,
  Calendar,
  User,
  DataLine,
  ChatDotRound,
  Folder,
  Setting,
  Fold,
  Expand,
} from '@element-plus/icons-vue';

export interface NavItem {
  id: string;
  label: string;
  icon?: typeof User;
  path?: string;
  children?: NavItem[];
}

const menuItems: NavItem[] = [
  { id: 'home', label: '主页', icon: HomeFilled, path: '/home' },
  { id: 'multi', label: '多开面板', icon: Monitor, path: '/multi-panel' },
  {
    id: 'publish',
    label: '发布',
    icon: Calendar,
    children: [
      { id: 'publish-calendar', label: '发布日历', path: '/publish' },
      { id: 'publish-tasks', label: '任务管理', path: '/tasks' },
      { id: 'publish-drafts', label: '草稿管理', path: '/drafts' },
    ],
  },
  {
    id: 'accounts',
    label: '账号',
    icon: User,
    children: [
      { id: 'accounts-manage', label: '账号管理', path: '/accounts' },
      { id: 'accounts-groups', label: '分组管理', path: '/groups' },
    ],
  },
  {
    id: 'stats',
    label: '数据',
    icon: DataLine,
    children: [
      { id: 'stats-overview', label: '播放流速', path: '/stats' },
      { id: 'stats-accounts', label: '账号监控', path: '/stats' },
      { id: 'stats-content', label: '作品监控', path: '/stats' },
    ],
  },
  { id: 'comments', label: '私信评论', icon: ChatDotRound, path: '/comments' },
  {
    id: 'content',
    label: '素材',
    icon: Folder,
    children: [
      { id: 'content-materials', label: '素材管理', path: '/materials' },
      { id: 'content-videos', label: '视频分组', path: '/content' },
      { id: 'content-images', label: '图文分组', path: '/content' },
    ],
  },
  {
    id: 'settings',
    label: '系统',
    icon: Setting,
    children: [
      { id: 'settings-proxy', label: '代理池', path: '/settings' },
      { id: 'settings-fingerprint', label: '指纹模版', path: '/settings' },
      { id: 'settings-presets', label: '发布预设', path: '/settings' },
    ],
  },
];

const route = useRoute();
const router = useRouter();
const collapsed = ref(false);
const expandedId = ref<string | null>(null);

// Expose for MainLayout to render sub-nav in header area
const activeSubItems = computed(() => {
  if (!expandedId.value) {
    // Auto-detect from current route
    const parent = menuItems.find(
      (m) => m.children?.some((c) => c.path === route.path)
    );
    return parent?.children ?? [];
  }
  const parent = menuItems.find((m) => m.id === expandedId.value);
  return parent?.children ?? [];
});

defineExpose({ activeSubItems, menuItems });

function handleItemClick(item: NavItem) {
  if (item.children && item.children.length > 0) {
    // Toggle expand: click same collapses, different expands
    expandedId.value = expandedId.value === item.id ? null : item.id;
    // Navigate to first child
    if (expandedId.value && item.children[0]?.path) {
      router.push(item.children[0].path);
    }
  } else if (item.path) {
    // Leaf node — direct navigation
    expandedId.value = null;
    router.push(item.path);
  }
}

function isItemActive(item: NavItem): boolean {
  if (item.path && route.path === item.path) return true;
  if (item.children) {
    return item.children.some((c) => c.path === route.path);
  }
  return false;
}
</script>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-sidebar);
  flex-shrink: 0;
  width: var(--sidebar-width);
  transition: width var(--transition-base);
  overflow: hidden;
  border-right: 1px solid var(--color-border-light);
  position: relative;
  z-index: var(--z-sidebar);
}

.sidebar.sidebar--collapsed {
  width: var(--sidebar-collapsed-width);
}

/* macOS traffic lights spacer */
.sidebar__traffic-lights {
  height: 38px;
  flex-shrink: 0;
  -webkit-app-region: drag;
}

.sidebar__brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border-light);
}

.sidebar.sidebar--collapsed .sidebar__brand {
  justify-content: center;
}

.sidebar__logo {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-bg-card);
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-lg);
  flex-shrink: 0;
}

.sidebar__title {
  color: var(--color-text-primary);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  white-space: nowrap;
  letter-spacing: 0;
}

.sidebar__nav {
  flex: 1;
  padding: var(--space-3) var(--space-2);
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.sidebar__nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--color-text-sidebar);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
  user-select: none;
}

.sidebar.sidebar--collapsed .sidebar__nav-item {
  justify-content: center;
}

.sidebar__nav-item:hover {
  color: var(--color-primary);
  background: var(--color-bg-sidebar-hover);
}

.sidebar__nav-item--active {
  color: var(--color-primary);
  background: var(--color-bg-sidebar-active);
}

.sidebar__nav-item--expanded {
  color: var(--color-primary);
  background: var(--color-bg-sidebar-active);
}

.sidebar__nav-label {
  font-size: var(--font-size-sm);
  flex: 1;
}

.sidebar__footer {
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--color-border-light);
}

.sidebar__toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-2);
  border-radius: var(--radius-md);
  color: var(--color-text-sidebar);
  background: none;
  border: none;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.sidebar__toggle:hover {
  color: var(--color-primary);
  background: var(--color-bg-sidebar-hover);
}

.fade-text-enter-active,
.fade-text-leave-active {
  transition: opacity var(--transition-fast);
}

.fade-text-enter-from,
.fade-text-leave-to {
  opacity: 0;
}
</style>
