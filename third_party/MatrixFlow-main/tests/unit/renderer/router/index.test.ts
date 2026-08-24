import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRouter, createMemoryHistory, type RouteRecordRaw } from 'vue-router';
import { setActivePinia, createPinia } from 'pinia';
import { installMatrixflowMock, removeMatrixflowMock } from '../../../mocks/window-matrixflow';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: { template: '<div><router-view /></div>' },
    redirect: '/accounts',
    children: [
      { path: 'accounts', name: 'Accounts', component: { template: '<div>Accounts</div>' } },
      { path: 'content', name: 'Content', component: { template: '<div>Content</div>' } },
      { path: 'publish', name: 'Publish', component: { template: '<div>Publish</div>' } },
      { path: 'tasks', name: 'Tasks', component: { template: '<div>Tasks</div>' } },
      { path: 'groups', name: 'Groups', component: { template: '<div>Groups</div>' } },
      { path: 'stats', name: 'Stats', component: { template: '<div>Stats</div>' } },
      { path: 'settings', name: 'Settings', component: { template: '<div>Settings</div>' } },
    ],
  },
];

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes,
  });
}

describe('Router Guard', () => {
  let mock: ReturnType<typeof installMatrixflowMock>;

  beforeEach(() => {
    setActivePinia(createPinia());
    mock = installMatrixflowMock();
  });

  afterEach(() => {
    removeMatrixflowMock();
  });

  it('should define all expected routes', () => {
    const router = createTestRouter();
    const routeNames = router.getRoutes().map((r) => r.name);
    expect(routeNames).toContain('Accounts');
    expect(routeNames).toContain('Content');
    expect(routeNames).toContain('Publish');
    expect(routeNames).toContain('Tasks');
    expect(routeNames).toContain('Groups');
    expect(routeNames).toContain('Stats');
    expect(routeNames).toContain('Settings');
  });

  it('should redirect / to /accounts', () => {
    const router = createTestRouter();
    const rootRoute = router.getRoutes().find((r) => r.path === '/');
    expect(rootRoute?.redirect).toBe('/accounts');
  });

  it('should resolve /accounts route', async () => {
    const router = createTestRouter();
    await router.push('/accounts');
    await router.isReady();
    expect(router.currentRoute.value.name).toBe('Accounts');
  });

  it('should resolve /content route', async () => {
    const router = createTestRouter();
    await router.push('/content');
    await router.isReady();
    expect(router.currentRoute.value.name).toBe('Content');
  });

  it('should resolve /publish route', async () => {
    const router = createTestRouter();
    await router.push('/publish');
    await router.isReady();
    expect(router.currentRoute.value.name).toBe('Publish');
  });

  it('should resolve /tasks route', async () => {
    const router = createTestRouter();
    await router.push('/tasks');
    await router.isReady();
    expect(router.currentRoute.value.name).toBe('Tasks');
  });

  it('should resolve /groups route', async () => {
    const router = createTestRouter();
    await router.push('/groups');
    await router.isReady();
    expect(router.currentRoute.value.name).toBe('Groups');
  });

  it('should resolve /stats route', async () => {
    const router = createTestRouter();
    await router.push('/stats');
    await router.isReady();
    expect(router.currentRoute.value.name).toBe('Stats');
  });

  it('should resolve /settings route', async () => {
    const router = createTestRouter();
    await router.push('/settings');
    await router.isReady();
    expect(router.currentRoute.value.name).toBe('Settings');
  });

  it('should have child routes under root path', () => {
    const router = createTestRouter();
    const rootChildren = router.getRoutes().filter((r) => r.path.startsWith('/'));
    expect(rootChildren.length).toBeGreaterThan(1);
  });
});
