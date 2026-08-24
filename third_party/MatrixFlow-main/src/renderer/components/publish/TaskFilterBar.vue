<template>
  <div class="task-filter">
    <div class="task-filter__fields">
      <label class="task-filter__field">
        <span class="task-filter__label">状态</span>
        <el-select
          v-model="localFilter.status"
          placeholder="全部状态"
          clearable
          multiple
          collapse-tags
          collapse-tags-limit="1"
          @change="applyFilters"
        >
          <el-option label="待执行" value="pending" />
          <el-option label="执行中" value="running" />
          <el-option label="已完成" value="completed" />
          <el-option label="失败" value="failed" />
          <el-option label="已取消" value="cancelled" />
          <el-option label="已跳过" value="skipped" />
        </el-select>
      </label>

      <label class="task-filter__field">
        <span class="task-filter__label">平台</span>
        <el-select
          v-model="localFilter.platform"
          placeholder="全部平台"
          clearable
          multiple
          collapse-tags
          collapse-tags-limit="1"
          @change="applyFilters"
        >
          <el-option label="抖音" value="douyin" />
          <el-option label="小红书" value="xiaohongshu" />
          <el-option label="视频号" value="channels" />
          <el-option label="快手" value="kuaishou" />
        </el-select>
      </label>

      <label class="task-filter__field">
        <span class="task-filter__label">计划</span>
        <el-select v-model="localFilter.planId" placeholder="全部计划" clearable @change="applyFilters">
          <el-option label="独立发布" :value="null" />
          <el-option v-for="plan in plans" :key="plan.id" :label="plan.name" :value="plan.id" />
        </el-select>
      </label>

      <label class="task-filter__field task-filter__field--date">
        <span class="task-filter__label">创建日期</span>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          range-separator="至"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          unlink-panels
          @change="applyFilters"
        />
      </label>
    </div>

    <div class="task-filter__actions">
      <el-input
        v-model="localFilter.search"
        class="task-filter__search"
        placeholder="搜索标题、账号或错误信息"
        clearable
        @keyup.enter="applyFilters"
        @clear="applyFilters"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-button type="primary" @click="applyFilters">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { useTaskStore } from '@/renderer/stores/task';
import type { TaskFilter } from '@/renderer/stores/task';

interface Plan {
  id: string;
  name: string;
}

interface Props {
  plans?: Plan[];
}

const props = withDefaults(defineProps<Props>(), {
  plans: () => [],
});

const taskStore = useTaskStore();
const emit = defineEmits<{
  (e: 'change'): void;
}>();

const localFilter = ref<TaskFilter>({
  status: [],
  platform: [],
  planId: undefined,
  dateFrom: taskStore.filter.dateFrom,
  dateTo: taskStore.filter.dateTo,
  search: '',
});
const dateRange = ref<[string, string] | []>(
  taskStore.filter.dateFrom && taskStore.filter.dateTo
    ? [taskStore.filter.dateFrom, taskStore.filter.dateTo]
    : [],
);

watch(
  () => taskStore.filter,
  (newFilter) => {
    localFilter.value.status = newFilter.status || [];
    localFilter.value.platform = newFilter.platform || [];
    localFilter.value.planId = newFilter.planId;
    localFilter.value.dateFrom = newFilter.dateFrom;
    localFilter.value.dateTo = newFilter.dateTo;
    localFilter.value.search = newFilter.search || '';
    dateRange.value = newFilter.dateFrom && newFilter.dateTo
      ? [newFilter.dateFrom, newFilter.dateTo]
      : [];
  },
  { deep: true },
);

function applyFilters() {
  const [dateFrom, dateTo] = dateRange.value;
  taskStore.filter.status = [...(localFilter.value.status || [])];
  taskStore.filter.platform = [...(localFilter.value.platform || [])];
  taskStore.filter.planId = localFilter.value.planId;
  taskStore.filter.dateFrom = dateFrom;
  taskStore.filter.dateTo = dateTo;
  taskStore.filter.search = localFilter.value.search?.trim() || undefined;
  taskStore.filter.offset = 0;
  emit('change');
}

function resetFilters() {
  localFilter.value.status = [];
  localFilter.value.platform = [];
  localFilter.value.planId = undefined;
  localFilter.value.search = '';
  dateRange.value = [];
  applyFilters();
}
</script>

<style scoped>
.task-filter {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  background: var(--color-bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-light);
  padding: var(--space-3);
  box-shadow: var(--shadow-xs);
}

.task-filter__fields {
  display: grid;
  grid-template-columns: minmax(140px, 0.8fr) minmax(140px, 0.8fr) minmax(150px, 1fr) minmax(260px, 1.5fr);
  gap: var(--space-3);
  align-items: end;
}

.task-filter__field {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.task-filter__label {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  line-height: 1;
}

.task-filter__field :deep(.el-select),
.task-filter__field :deep(.el-date-editor) {
  width: 100%;
}

.task-filter__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border-light);
}

.task-filter__search {
  width: min(360px, 100%);
  margin-right: auto;
}

.task-filter :deep(.el-input__wrapper) {
  border-radius: var(--radius-md);
  box-shadow: none;
  border: 1px solid var(--color-border);
}

.task-filter :deep(.el-input__wrapper:hover) {
  border-color: var(--color-primary);
}

.task-filter :deep(.el-input__wrapper:focus-within) {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-lighter);
}

.task-filter :deep(.el-input__inner) {
  font-size: var(--font-size-sm);
}

.task-filter :deep(.el-date-editor .el-input__wrapper) {
  border-radius: var(--radius-md);
  box-shadow: none;
  border: 1px solid var(--color-border);
}

.task-filter :deep(.el-date-editor .el-input__wrapper:hover) {
  border-color: var(--color-primary);
}

.task-filter :deep(.el-input__prefix) {
  color: var(--color-text-placeholder);
}

@media (max-width: 1180px) {
  .task-filter__fields {
    grid-template-columns: repeat(2, minmax(180px, 1fr));
  }
}

@media (max-width: 720px) {
  .task-filter__fields {
    grid-template-columns: 1fr;
  }

  .task-filter__actions {
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .task-filter__search {
    width: 100%;
    margin-right: 0;
  }
}
</style>
