import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import MainLayout from '@/renderer/layouts/MainLayout.vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: MainLayout,
    redirect: '/home',
    children: [
      {
        path: 'home',
        name: 'Home',
        component: () => import('@/renderer/views/Home.vue'),
        meta: { title: '主页', icon: 'HomeFilled' },
      },
      {
        path: 'accounts',
        name: 'Accounts',
        component: () => import('@/renderer/views/Accounts.vue'),
        meta: { title: '账号管理', icon: 'User' },
      },
      {
        path: 'content',
        name: 'Content',
        component: () => import('@/renderer/views/Content.vue'),
        meta: { title: '内容库', icon: 'Folder' },
      },
      {
        path: 'materials',
        name: 'Materials',
        component: () => import('@/renderer/views/Materials.vue'),
        meta: { title: '素材管理', icon: 'Picture' },
      },
      {
        path: 'publish',
        redirect: '/publish/tasks',
      },
      {
        path: 'publish/video',
        name: 'PublishVideo',
        component: () => import('@/renderer/views/publish/VideoPublish.vue'),
        meta: { title: '视频发布', icon: 'VideoCamera' },
      },
      {
        path: 'publish/tasks',
        name: 'PublishTasks',
        component: () => import('@/renderer/views/publish/Tasks.vue'),
        meta: { title: '任务管理', icon: 'List' },
      },
      {
        path: 'publish/drafts',
        name: 'PublishDrafts',
        component: () => import('@/renderer/views/publish/Drafts.vue'),
        meta: { title: '草稿管理', icon: 'Document' },
      },
      {
        path: 'tasks',
        redirect: '/publish/tasks',
      },
      {
        path: 'drafts',
        redirect: '/publish/drafts',
      },
      {
        path: 'groups',
        name: 'Groups',
        component: () => import('@/renderer/views/Groups.vue'),
        meta: { title: '分组管理', icon: 'Grid' },
      },
      {
        path: 'stats',
        name: 'Stats',
        component: () => import('@/renderer/views/Stats.vue'),
        meta: { title: '数据中心', icon: 'DataLine' },
      },
      {
        path: 'multi-panel',
        name: 'MultiPanel',
        component: () => import('@/renderer/views/MultiPanel.vue'),
        meta: { title: '多开面板', icon: 'Monitor' },
      },
      {
        path: 'comments',
        name: 'Comments',
        component: () => import('@/renderer/views/Comments.vue'),
        meta: { title: '评论管理', icon: 'ChatDotRound' },
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/renderer/views/Settings.vue'),
        meta: { title: '设置', icon: 'Setting' },
      },

    ],
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

let settingsFetched = false;

router.beforeEach(async (to) => {
  if (to.matched.length === 0) {
    return { name: 'Home' };
  }
});

export default router;
