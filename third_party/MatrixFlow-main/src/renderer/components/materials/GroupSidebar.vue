<template>
  <div class="material-group-sidebar">
    <div class="material-group-sidebar__header">
      <span class="material-group-sidebar__title">素材分组</span>
      <el-button text size="small" @click="showCreateDialog = true">
        <el-icon><Plus /></el-icon>
      </el-button>
    </div>

    <div class="material-group-sidebar__list">
      <div
        class="material-group-sidebar__item"
        :class="{ 'material-group-sidebar__item--active': !currentGroupId }"
        @click="handleSelectGroup(null)"
      >
        <el-icon><FolderOpened /></el-icon>
        <span>全部素材</span>
        <el-badge :value="totalCount" :max="99" class="material-group-sidebar__badge" />
      </div>

      <div
        v-for="group in groups"
        :key="group.id"
        class="material-group-sidebar__item"
        :class="{ 'material-group-sidebar__item--active': currentGroupId === group.id }"
        @click="handleSelectGroup(group.id)"
      >
        <el-icon :style="{ color: group.color || '#409EFF' }"><Folder /></el-icon>
        <span>{{ group.name }}</span>
        <el-badge :value="group.count" :max="99" class="material-group-sidebar__badge" />
        <el-dropdown trigger="click" @command="handleCommand($event, group)">
          <el-button text size="small" class="material-group-sidebar__more">
            <el-icon><MoreFilled /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="edit">编辑</el-dropdown-item>
              <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <el-dialog
      v-model="showCreateDialog"
      :title="editingGroup ? '编辑分组' : '新建分组'"
      width="400px"
    >
      <el-form :model="form" label-width="80px">
        <el-form-item label="分组名称">
          <el-input v-model="form.name" placeholder="请输入分组名称" />
        </el-form-item>
        <el-form-item label="分组颜色">
          <el-color-picker v-model="form.color" :predefine="presetColors" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSave">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, FolderOpened, Folder, MoreFilled } from '@element-plus/icons-vue';
import type { MaterialGroup } from '../../stores/materials';

const props = defineProps<{
  groups: MaterialGroup[];
  currentGroupId: string | null;
  totalCount: number;
}>();

const emit = defineEmits<{
  select: [groupId: string | null];
  create: [name: string, color?: string];
  delete: [id: string];
}>();

const showCreateDialog = ref(false);
const editingGroup = ref<MaterialGroup | null>(null);
const form = reactive({
  name: '',
  color: '#409EFF',
});

const presetColors = [
  '#409EFF',
  '#67C23A',
  '#E6A23C',
  '#F56C6C',
  '#909399',
  '#00D4AA',
];

function handleSelectGroup(groupId: string | null) {
  emit('select', groupId);
}

function handleCommand(command: string, group: MaterialGroup) {
  if (command === 'edit') {
    editingGroup.value = group;
    form.name = group.name;
    form.color = group.color || '#409EFF';
    showCreateDialog.value = true;
  } else if (command === 'delete') {
    ElMessageBox.confirm(
      `确定删除分组「${group.name}」吗？分组内的素材不会被删除。`,
      '删除分组',
      { type: 'warning' }
    ).then(() => {
      emit('delete', group.id);
    }).catch(() => {});
  }
}

async function handleSave() {
  if (!form.name.trim()) {
    ElMessage.warning('请输入分组名称');
    return;
  }

  if (editingGroup.value) {
    ElMessage.info('编辑分组功能暂未实现');
  } else {
    emit('create', form.name, form.color);
  }

  showCreateDialog.value = false;
  editingGroup.value = null;
  form.name = '';
  form.color = '#409EFF';
}
</script>

<style scoped>
.material-group-sidebar {
  width: 220px;
  height: 100%;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-light);
  display: flex;
  flex-direction: column;
}

.material-group-sidebar__header {
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--el-border-color-light);
}

.material-group-sidebar__title {
  font-weight: 500;
  font-size: 14px;
}

.material-group-sidebar__list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.material-group-sidebar__item {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.material-group-sidebar__item:hover {
  background: var(--el-fill-color-light);
}

.material-group-sidebar__item--active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.material-group-sidebar__item > .el-icon {
  margin-right: 8px;
  font-size: 16px;
}

.material-group-sidebar__item > span {
  flex: 1;
  font-size: 13px;
}

.material-group-sidebar__badge {
  margin-left: 8px;
}

.material-group-sidebar__more {
  opacity: 0;
  transition: opacity 0.2s;
}

.material-group-sidebar__item:hover .material-group-sidebar__more {
  opacity: 1;
}
</style>
