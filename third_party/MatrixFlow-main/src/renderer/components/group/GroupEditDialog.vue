<template>
  <el-dialog
    :model-value="modelValue"
    :title="isEdit ? '编辑分组' : '创建分组'"
    width="440px"
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
    @closed="resetForm"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="分组名称" prop="name">
        <el-input v-model="form.name" placeholder="输入分组名称" maxlength="20" show-word-limit />
      </el-form-item>

      <el-form-item label="标记颜色">
        <div class="color-picker">
          <button
            v-for="(c, i) in cssVarColors"
            :key="c"
            class="color-picker__item"
            :class="{ 'color-picker__item--active': form.color === resolvedColors[i] }"
            :style="{ background: c }"
            @click="form.color = resolvedColors[i]"
          />
        </div>
      </el-form-item>

      <el-form-item label="选择账号">
        <el-select
          v-model="form.accountIds"
          multiple
          filterable
          placeholder="选择要加入分组的账号"
          style="width: 100%"
        >
          <el-option
            v-for="a in accountStore.accounts"
            :key="a.id"
            :label="`${a.nickname} (${platformLabel(a.platform)})`"
            :value="a.id"
          />
        </el-select>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">
        {{ isEdit ? '保存修改' : '确认创建' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { useAccountStore } from '@/renderer/stores/account';
import { useGroupStore, type Group } from '@/renderer/stores/group';

const props = defineProps<{
  modelValue: boolean;
  group?: Group | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [];
}>();

const accountStore = useAccountStore();
const groupStore = useGroupStore();

const formRef = ref<FormInstance>();
const submitting = ref(false);

const isEdit = computed(() => !!props.group?.id);

const cssVarColors = [
  'var(--group-color-1)', 'var(--group-color-2)',
  'var(--group-color-3)', 'var(--group-color-4)',
  'var(--group-color-5)', 'var(--group-color-6)',
  'var(--group-color-7)', 'var(--group-color-8)',
];

const resolvedColors = [
  '#db4b4b', '#e8993d', '#37b36e', '#2974e0',
  '#8a95a5', '#7f52b8', '#29b89d', '#e04040',
];

const form = reactive({
  name: '',
  color: resolvedColors[0],
  accountIds: [] as string[],
});

const validateUniqueName = async (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  if (!value) {
    callback(new Error('请输入分组名称'));
    return;
  }
  const existing = groupStore.groups.find(
    (g) => g.name === value && g.id !== props.group?.id
  );
  if (existing) {
    callback(new Error('分组名称已存在'));
    return;
  }
  callback();
};

const rules: FormRules = {
  name: [
    { required: true, message: '请输入分组名称', trigger: 'blur' },
    { min: 1, max: 20, message: '长度在 1 到 20 个字符', trigger: 'blur' },
    { validator: validateUniqueName, trigger: 'blur' },
  ],
};

watch(
  () => props.modelValue,
  (visible) => {
    if (visible && props.group) {
      form.name = props.group.name;
      form.color = props.group.color;
      form.accountIds = [...props.group.accountIds];
    }
  },
);

// Also watch group prop for case where group is set after dialog is already open
watch(
  () => props.group,
  (group) => {
    if (props.modelValue && group) {
      form.name = group.name;
      form.color = group.color;
      form.accountIds = [...group.accountIds];
    }
  },
);

function resetForm() {
  form.name = '';
  form.color = resolvedColors[0];
  form.accountIds = [];
}

const platformMap: Record<string, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  channels: '视频号',
  kuaishou: '快手',
  bilibili: 'B站',
};

function platformLabel(key: string): string {
  return platformMap[key] || key;
}

async function handleSubmit() {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    if (isEdit.value && props.group) {
      console.log('[GroupEditDialog] updateGroup payload:', {
        id: props.group.id,
        name: form.name,
        color: form.color,
        accountIds: form.accountIds,
      });
      const result = await groupStore.updateGroup(props.group.id, {
        name: form.name,
        color: form.color,
        accountIds: form.accountIds,
      });
      console.log('[GroupEditDialog] updateGroup result:', result);
      ElMessage.success('分组已更新');
    } else {
      console.log('[GroupEditDialog] createGroup payload:', {
        name: form.name,
        accountIds: form.accountIds,
      });
      await groupStore.createGroup({
        name: form.name,
        accountIds: form.accountIds,
      });
      ElMessage.success('分组创建成功');
    }
    emit('update:modelValue', false);
    emit('saved');
  } catch (err) {
    console.error('[GroupEditDialog] submit error:', err);
    ElMessage.error('操作失败，请重试');
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.color-picker {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.color-picker__item {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform var(--transition-fast), border-color var(--transition-fast);
  outline: none;
}

.color-picker__item:hover {
  transform: scale(1.15);
}

.color-picker__item--active {
  border-color: var(--color-text-primary);
  box-shadow: 0 0 0 2px var(--color-bg-card), 0 0 0 4px var(--color-text-secondary);
}
</style>
