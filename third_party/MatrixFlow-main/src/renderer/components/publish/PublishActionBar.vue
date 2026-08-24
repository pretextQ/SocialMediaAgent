<template>
  <div class="action-bar">
    <el-button text type="danger" @click="$emit('clear-all')">
      一键清空
    </el-button>
    <el-button @click="$emit('save-draft')">
      保存草稿
    </el-button>
    <el-button type="primary" :loading="publishing" :disabled="disabled" @click="$emit('publish')">
      <el-icon :size="14"><Promotion /></el-icon>
      {{ publishing ? '发布队列中' : '立即发布' }}
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { Promotion } from '@element-plus/icons-vue';

defineProps<{
  publishing?: boolean;
  disabled?: boolean;
}>();

defineEmits<{
  'clear-all': [];
  'save-draft': [];
  publish: [];
}>();
</script>

<style scoped>
.action-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
}
</style>
