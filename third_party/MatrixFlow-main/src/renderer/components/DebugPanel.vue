<template>
  <Teleport to="body">
    <Transition name="debug-panel">
      <div v-if="visible" class="debug-panel" :class="{ 'debug-panel--collapsed': collapsed }">
        <div class="debug-panel__header" @mousedown="startDrag" @click="toggleCollapse">
          <div class="debug-panel__title">
            <span class="debug-panel__dot" :class="`debug-panel__dot--${currentStatus}`" />
            调试面板
          </div>
          <button class="debug-panel__collapse-btn" @click.stop="toggleCollapse">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path v-if="collapsed" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" fill="currentColor"/>
              <path v-else d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" fill="currentColor"/>
            </svg>
          </button>
        </div>

        <div v-if="!collapsed" class="debug-panel__steps">
          <div v-if="steps.length === 0" class="debug-panel__empty">
            暂无调试步骤
          </div>
          <div
            v-for="step in steps"
            :key="step.id"
            class="debug-step"
            :class="[
              `debug-step--${step.status}`,
              { 'debug-step--selected': selectedStepId === step.id }
            ]"
            @click="selectStep(step)"
          >
            <div class="debug-step__icon">
              <svg v-if="step.status === 'done'" viewBox="0 0 24 24" width="14" height="14">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="currentColor"/>
              </svg>
              <svg v-else-if="step.status === 'failed'" viewBox="0 0 24 24" width="14" height="14">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" width="14" height="14" class="debug-step__spinner">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="30 70" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="debug-step__content">
              <div class="debug-step__name">{{ step.name }}</div>
              <div class="debug-step__meta">
                <span v-if="step.durationMs" class="debug-step__duration">{{ step.durationMs }}ms</span>
                <span v-if="step.error" class="debug-step__error">{{ step.error }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!collapsed && selectedStep" class="debug-panel__snapshot">
          <div class="debug-panel__snapshot-header">
            <span>{{ selectedStep.name }} 快照</span>
            <button class="debug-panel__close-snapshot" @click="selectedStepId = null">
              <svg viewBox="0 0 24 24" width="12" height="12">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" fill="currentColor"/>
              </svg>
            </button>
          </div>
          <div v-if="selectedStep.after?.url" class="debug-panel__snapshot-info">
            {{ selectedStep.after.url }}
          </div>
          <div v-if="selectedStep.after?.title" class="debug-panel__snapshot-info">
            {{ selectedStep.after.title }}
          </div>
          <div v-if="selectedStep.error" class="debug-panel__snapshot-error">
            {{ selectedStep.error }}
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '@/renderer/stores/settings';
import { getDebugRecorder } from '@electron/platform/base/DebugRecorder';
import type { DebugStep } from '@electron/platform/base/DebugRecorder';

const settings = useSettingsStore();
const visible = ref(false);
const collapsed = ref(false);
const steps = ref<DebugStep[]>([]);
const selectedStepId = ref<string | null>(null);

const selectedStep = computed(() =>
  steps.value.find(s => s.id === selectedStepId.value) ?? null
);

const currentStatus = computed(() => {
  if (steps.value.some(s => s.status === 'running')) return 'running';
  if (steps.value.some(s => s.status === 'failed')) return 'failed';
  return 'done';
});

let unsubscribe: (() => void) | null = null;

function selectStep(step: DebugStep) {
  if (step.status === 'failed') {
    selectedStepId.value = step.id;
  }
}

function toggleCollapse() {
  collapsed.value = !collapsed.value;
}

let dragOffsetX = 0;
let dragOffsetY = 0;

function startDrag(e: MouseEvent) {
  if (collapsed.value) return;
  dragOffsetX = e.clientX;
  dragOffsetY = e.clientY;
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
}

function onDrag(e: MouseEvent) {
  const panel = document.querySelector('.debug-panel') as HTMLElement;
  if (!panel) return;
  const dx = e.clientX - dragOffsetX;
  const dy = e.clientY - dragOffsetY;
  panel.style.right = 'auto';
  panel.style.left = `${panel.offsetLeft + dx}px`;
  panel.style.bottom = 'auto';
  panel.style.top = `${panel.offsetTop + dy}px`;
  dragOffsetX = e.clientX;
  dragOffsetY = e.clientY;
}

function stopDrag() {
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
}

function refreshSteps() {
  try {
    const recorder = getDebugRecorder();
    steps.value = recorder.toJSON();
  } catch {
    steps.value = [];
  }
}

let pollInterval: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  await settings.fetchSettings();
  visible.value = settings.settings.debugMode;

  pollInterval = setInterval(refreshSteps, 1000);
});

onUnmounted(() => {
  if (pollInterval !== null) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  const fn = unsubscribe;
  if (fn !== null) {
    fn();
    unsubscribe = null;
  }
});
</script>

<style scoped>
.debug-panel {
  position: fixed;
  right: 16px;
  bottom: 16px;
  width: 320px;
  max-height: 480px;
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, rgba(0,0,0,.12));
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,.18);
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  overflow: hidden;
  transition: width 0.2s ease;
}

.debug-panel--collapsed {
  width: auto;
  max-height: none;
}

.debug-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: var(--color-bg-page, #f8fafc);
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
  cursor: pointer;
  user-select: none;
}

.debug-panel__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--color-text-primary, #1a1a1a);
}

.debug-panel__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
}

.debug-panel__dot--running {
  background: #1a73e8;
  animation: pulse 1.5s infinite;
}

.debug-panel__dot--failed {
  background: #d93025;
}

.debug-panel__dot--done {
  background: #188038;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.debug-panel__collapse-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: var(--color-text-secondary, #5f6368);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.debug-panel__collapse-btn:hover {
  background: var(--color-bg-page, #f1f5f9);
}

.debug-panel__steps {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.debug-panel__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-placeholder, #94a3b8);
}

.debug-step {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background 0.15s;
}

.debug-step:hover {
  background: var(--color-bg-page, #f8fafc);
}

.debug-step--failed {
  background: #fef2f2;
  border-left: 3px solid #d93025;
}

.debug-step--selected {
  outline: 2px solid #1a73e8;
}

.debug-step__icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 1px;
}

.debug-step--done .debug-step__icon { color: #188038; }
.debug-step--failed .debug-step__icon { color: #d93025; }
.debug-step--running .debug-step__icon { color: #1a73e8; }

.debug-step__spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.debug-step__content {
  flex: 1;
  min-width: 0;
}

.debug-step__name {
  font-weight: 500;
  color: var(--color-text-primary, #1a1a1a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.debug-step__meta {
  display: flex;
  gap: 8px;
  margin-top: 2px;
  font-size: 11px;
  color: var(--color-text-secondary, #5f6368);
}

.debug-step__duration {
  font-family: 'SF Mono', monospace;
}

.debug-step__error {
  color: #d93025;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.debug-panel__snapshot {
  border-top: 1px solid var(--color-border-light, #f1f5f9);
  padding: 10px 14px;
  background: var(--color-bg-page, #f8fafc);
  font-size: 11px;
}

.debug-panel__snapshot-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  color: var(--color-text-primary, #1a1a1a);
  margin-bottom: 6px;
}

.debug-panel__close-snapshot {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-secondary, #5f6368);
  padding: 2px;
  border-radius: 4px;
  display: flex;
}

.debug-panel__close-snapshot:hover {
  background: var(--color-border, rgba(0,0,0,.08));
}

.debug-panel__snapshot-info {
  color: var(--color-text-secondary, #5f6368);
  margin-bottom: 2px;
  word-break: break-all;
}

.debug-panel__snapshot-error {
  color: #d93025;
  margin-top: 4px;
  word-break: break-all;
}

.debug-panel-enter-active,
.debug-panel-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.debug-panel-enter-from,
.debug-panel-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>
