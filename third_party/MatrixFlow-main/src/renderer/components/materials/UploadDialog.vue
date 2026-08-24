<template>
  <el-dialog
    v-model="visible"
    title="上传素材"
    width="560px"
    @close="handleClose"
  >
    <div class="upload-drop-zone" @click="pickFiles">
      <el-icon class="upload-drop-zone__icon"><UploadFilled /></el-icon>
      <div class="upload-drop-zone__text">
        点击选择文件，或将文件拖拽到此处
      </div>
      <div class="upload-drop-zone__tip">
        支持 JPG、PNG、GIF、WebP、MP4、MOV 格式，单文件不超过 500MB
      </div>
    </div>

    <div v-if="selectedFiles.length > 0" class="upload-file-list">
      <div v-for="(f, idx) in selectedFiles" :key="idx" class="upload-file-item">
        <span class="upload-file-item__name">{{ f.name }}</span>
        <span class="upload-file-item__size">{{ formatSize(f.size) }}</span>
        <el-button link type="danger" size="small" @click="removeFile(idx)">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
    </div>

    <el-form :model="form" label-width="80px" class="upload-form">
      <el-form-item label="目标分组">
        <el-select v-model="form.groupId" placeholder="不分组" clearable>
          <el-option
            v-for="group in groups"
            :key="group.id"
            :label="group.name"
            :value="group.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="素材标题">
        <el-input v-model="form.title" placeholder="留空则使用文件名" />
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="form.description" type="textarea" :rows="2" placeholder="可选描述" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" :loading="uploading" :disabled="selectedFiles.length === 0" @click="handleUpload">
        上传 ({{ selectedFiles.length }})
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { UploadFilled, Close } from '@element-plus/icons-vue';
import type { MaterialGroup } from '../../stores/materials';

interface SelectedFile {
  path: string;
  name: string;
  size: number;
}

const props = defineProps<{
  groups: MaterialGroup[];
  currentGroupId?: string | null;
}>();

const emit = defineEmits<{
  upload: [payload: { filePath: string; groupId?: string; title?: string; description?: string }];
}>();

const visible = defineModel<boolean>({ default: false });

const uploading = ref(false);
const selectedFiles = ref<SelectedFile[]>([]);

const form = reactive({
  groupId: '' as string,
  title: '',
  description: '',
});

watch(visible, (newVal) => {
  if (newVal && props.currentGroupId) {
    form.groupId = props.currentGroupId;
  }
});

async function pickFiles() {
  if (!window.matrixflow?.dialog?.openFile) {
    ElMessage.error('文件选择功能不可用');
    return;
  }

  const filePath = await window.matrixflow.dialog.openFile({
    title: '选择素材文件',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '图片和视频', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi'] },
      { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
      { name: '视频', extensions: ['mp4', 'mov', 'avi'] },
    ],
  });

  if (!filePath) return;

  // dialog.openFile returns string | null for single, or we handle string[]
  // The IPC wraps it, so we get the raw return
  const paths = Array.isArray(filePath) ? filePath : [filePath];

  for (const p of paths) {
    if (!p) continue;
    // Avoid duplicates
    if (selectedFiles.value.some(f => f.path === p)) continue;
    const name = p.split(/[\\/]/).pop() || p;
    selectedFiles.value.push({ path: p, name, size: 0 });
  }
}

function removeFile(idx: number) {
  selectedFiles.value.splice(idx, 1);
}

async function handleUpload() {
  if (selectedFiles.value.length === 0) {
    ElMessage.warning('请选择要上传的文件');
    return;
  }

  uploading.value = true;

  for (const file of selectedFiles.value) {
    emit('upload', {
      filePath: file.path,
      groupId: form.groupId || undefined,
      title: form.title || undefined,
      description: form.description || undefined,
    });
  }

  uploading.value = false;
  visible.value = false;
  resetForm();
}

function handleClose() {
  visible.value = false;
  resetForm();
}

function resetForm() {
  selectedFiles.value = [];
  form.groupId = '';
  form.title = '';
  form.description = '';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
</script>

<style scoped>
.upload-drop-zone {
  border: 2px dashed var(--el-border-color);
  border-radius: 8px;
  padding: 32px 16px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s;
}

.upload-drop-zone:hover {
  border-color: var(--el-color-primary);
}

.upload-drop-zone__icon {
  font-size: 48px;
  color: var(--el-text-color-placeholder);
  margin-bottom: 8px;
}

.upload-drop-zone__text {
  color: var(--el-text-color-regular);
  font-size: 14px;
}

.upload-drop-zone__tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-top: 8px;
}

.upload-file-list {
  margin-top: 12px;
  max-height: 150px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
}

.upload-file-item {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  gap: 8px;
  font-size: 13px;
}

.upload-file-item:not(:last-child) {
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.upload-file-item__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-file-item__size {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.upload-form {
  margin-top: 16px;
}
</style>
