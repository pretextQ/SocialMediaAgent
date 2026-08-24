<template>
  <div class="proxy-pool-settings">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar__tabs">
        <div
          v-for="tab in statusTabs"
          :key="tab.key"
          class="tab-item"
          :class="{ 'tab-item--active': activeStatusFilter === tab.key }"
          @click="activeStatusFilter = tab.key"
        >
          <span class="tab-item__label">{{ tab.label }}</span>
          <span class="tab-item__count" :class="`tab-item__count--${tab.key}`">{{ tab.count }}</span>
        </div>
      </div>
      <div class="toolbar__actions">
        <el-button @click="handleImport">
          <el-icon><Upload /></el-icon>
          导入
        </el-button>
        <el-button @click="handleExport">
          <el-icon><Download /></el-icon>
          导出
        </el-button>
        <el-button @click="handleBatchCheck" :loading="batchChecking">
          <el-icon><Connection /></el-icon>
          批量检测
        </el-button>
        <el-button type="primary" @click="showCreateDialog">
          <el-icon><Plus /></el-icon>
          新增代理
        </el-button>
      </div>
    </div>

    <!-- 代理卡片网格 -->
    <div v-loading="loading" class="proxy-grid">
      <el-row :gutter="16">
        <el-col
          v-for="proxy in filteredProxies"
          :key="proxy.id"
          :xs="24"
          :sm="12"
          :md="8"
          :lg="6"
          class="proxy-col"
        >
          <el-card
            class="proxy-card"
            :class="{ 'proxy-card--editing': editingId === proxy.id }"
            shadow="hover"
            @click="showEditDialog(proxy)"
          >
            <div class="proxy-card__header">
              <div class="proxy-card__status-dot" :class="`proxy-card__status-dot--${proxy.status}`" />
              <span class="proxy-card__name">{{ proxy.name }}</span>
              <el-tag size="small" effect="plain">{{ proxy.protocol.toUpperCase() }}</el-tag>
            </div>

            <div class="proxy-card__body">
              <div class="proxy-card__address">{{ proxy.host }}:{{ proxy.port }}</div>
              <div class="proxy-card__meta">
                <span class="proxy-card__accounts">
                  <el-icon><User /></el-icon>
                  {{ proxy.boundAccounts || 0 }} 个账号
                </span>
              </div>
            </div>

            <div class="proxy-card__footer" @click.stop>
              <el-button size="small" text type="primary" @click="openAccountDrawer(proxy)">
                设置账号
              </el-button>
              <el-button size="small" text @click="checkProxy(proxy)" :loading="proxy.checking">
                检测
              </el-button>
              <el-popconfirm title="确定删除该代理？" @confirm="deleteProxy(proxy)">
                <template #reference>
                  <el-button size="small" text type="danger">删除</el-button>
                </template>
              </el-popconfirm>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <el-empty v-if="!loading && filteredProxies.length === 0" description="暂无代理">
        <el-button type="primary" @click="showCreateDialog">添加代理</el-button>
      </el-empty>
    </div>

    <!-- 创建/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑代理' : '添加代理'"
      width="500px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="代理名称" />
        </el-form-item>
        <el-form-item label="协议" prop="protocol">
          <el-select v-model="form.protocol" style="width: 100%">
            <el-option label="HTTP" value="http" />
            <el-option label="HTTPS" value="https" />
            <el-option label="SOCKS5" value="socks5" />
          </el-select>
        </el-form-item>
        <el-form-item label="主机" prop="host">
          <el-input v-model="form.host" placeholder="127.0.0.1" />
        </el-form-item>
        <el-form-item label="端口" prop="port">
          <el-input-number v-model="form.port" :min="1" :max="65535" style="width: 100%" />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="留空表示无需认证" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password placeholder="留空表示无需认证" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">
          {{ isEdit ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 导入弹窗 -->
    <el-dialog v-model="importDialogVisible" title="导入代理" width="500px" destroy-on-close>
      <div class="import-dialog">
        <el-upload
          ref="uploadRef"
          drag
          :auto-upload="false"
          :limit="1"
          accept=".json,.txt"
          :on-change="handleFileChange"
        >
          <el-icon><Upload /></el-icon>
          <div class="el-upload__text">拖拽文件到此处，或 <em>点击上传</em></div>
          <template #tip>
            <div class="el-upload__tip">支持 JSON 或 TXT 格式，每行一个代理，格式：protocol://host:port 或 protocol://host:port@user:pass</div>
          </template>
        </el-upload>
      </div>
      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmImport" :loading="importing">导入</el-button>
      </template>
    </el-dialog>

    <!-- 账号抽屉 -->
    <ProxyAccountDrawer
      v-model="accountDrawerVisible"
      :proxy-id="currentProxyId"
      @success="openAccountSelector"
    />

    <!-- 账号选择器 -->
    <AccountSelector
      v-model="accountSelectorVisible"
      :proxy-id="currentProxyId"
      @success="loadProxies"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { Plus, Upload, Download, Connection, User } from '@element-plus/icons-vue';
import ProxyAccountDrawer from './ProxyAccountDrawer.vue';
import AccountSelector from './AccountSelector.vue';

interface Proxy {
  id: string;
  name: string;
  protocol: string;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  status: 'active' | 'inactive' | 'unchecked';
  last_check_at: string | null;
  last_check_result: string | null;
  boundAccounts?: number;
  checking?: boolean;
}

const proxies = ref<Proxy[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
const isEdit = ref(false);
const submitting = ref(false);
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();

const accountDrawerVisible = ref(false);
const accountSelectorVisible = ref(false);
const currentProxyId = ref<string | null>(null);

const batchChecking = ref(false);
const importDialogVisible = ref(false);
const importing = ref(false);
const uploadRef = ref();
const importFileContent = ref('');

const form = reactive({
  name: '',
  protocol: 'http',
  host: '',
  port: 7890,
  username: '',
  password: '',
});

const rules: FormRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  protocol: [{ required: true, message: '请选择协议', trigger: 'change' }],
  host: [{ required: true, message: '请输入主机地址', trigger: 'blur' }],
  port: [{ required: true, message: '请输入端口', trigger: 'change' }],
};

type StatusFilter = 'all' | 'active' | 'inactive' | 'unchecked';
const activeStatusFilter = ref<StatusFilter>('all');

const statusTabs = computed(() => [
  { key: 'all' as StatusFilter, label: '总数', count: proxies.value.length },
  { key: 'active' as StatusFilter, label: '可用', count: proxies.value.filter(p => p.status === 'active').length },
  { key: 'inactive' as StatusFilter, label: '不可用', count: proxies.value.filter(p => p.status === 'inactive').length },
  { key: 'unchecked' as StatusFilter, label: '未检测', count: proxies.value.filter(p => p.status === 'unchecked').length },
]);

const filteredProxies = computed(() => {
  if (activeStatusFilter.value === 'all') return proxies.value;
  return proxies.value.filter(p => p.status === activeStatusFilter.value);
});

onMounted(() => {
  loadProxies();
});

async function loadProxies() {
  loading.value = true;
  try {
    const result = await window.matrixflow.proxy.list();
    if (result.success && result.data) {
      proxies.value = result.data;
    }
  } catch (error) {
    ElMessage.error('加载代理列表失败');
  } finally {
    loading.value = false;
  }
}

function showCreateDialog() {
  isEdit.value = false;
  editingId.value = null;
  Object.assign(form, {
    name: '',
    protocol: 'http',
    host: '',
    port: 7890,
    username: '',
    password: '',
  });
  dialogVisible.value = true;
}

function showEditDialog(proxy: Proxy) {
  isEdit.value = true;
  editingId.value = proxy.id;
  Object.assign(form, {
    name: proxy.name,
    protocol: proxy.protocol,
    host: proxy.host,
    port: proxy.port,
    username: proxy.username || '',
    password: proxy.password || '',
  });
  dialogVisible.value = true;
}

async function submitForm() {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    const data = {
      name: form.name,
      protocol: form.protocol,
      host: form.host,
      port: form.port,
      username: form.username || undefined,
      password: form.password || undefined,
    };

    if (isEdit.value && editingId.value) {
      await window.matrixflow.proxy.update(editingId.value, data);
      ElMessage.success('代理已更新');
    } else {
      await window.matrixflow.proxy.create(data);
      ElMessage.success('代理已创建');
    }

    dialogVisible.value = false;
    await loadProxies();
  } catch (error) {
    ElMessage.error(isEdit.value ? '更新失败' : '创建失败');
  } finally {
    submitting.value = false;
  }
}

async function checkProxy(proxy: Proxy) {
  proxy.checking = true;
  try {
    const result = await window.matrixflow.proxy.check(proxy.id);
    if (result.success && result.data) {
      ElMessage[result.data.success ? 'success' : 'error'](result.data.message);
      await loadProxies();
    }
  } catch (error) {
    ElMessage.error('检测失败');
  } finally {
    proxy.checking = false;
  }
}

async function deleteProxy(proxy: Proxy) {
  try {
    await window.matrixflow.proxy.delete(proxy.id);
    ElMessage.success('代理已删除');
    await loadProxies();
  } catch {
    ElMessage.error('删除失败');
  }
}

async function handleBatchCheck() {
  if (proxies.value.length === 0) {
    ElMessage.warning('暂无代理可检测');
    return;
  }
  try {
    await ElMessageBox.confirm(`确定检测全部 ${proxies.value.length} 个代理吗？`, '批量检测', {
      type: 'info',
    });
    batchChecking.value = true;
    for (const proxy of proxies.value) {
      proxy.checking = true;
    }
    // 并行检测
    await Promise.all(proxies.value.map(p => window.matrixflow.proxy.check(p.id)));
    ElMessage.success('批量检测完成');
    await loadProxies();
  } catch {
    // 用户取消
  } finally {
    batchChecking.value = false;
    proxies.value.forEach(p => p.checking = false);
  }
}

function handleImport() {
  importFileContent.value = '';
  importDialogVisible.value = true;
}

function handleFileChange(file: any) {
  const reader = new FileReader();
  reader.onload = (e) => {
    importFileContent.value = e.target?.result as string;
  };
  reader.readAsText(file.raw);
}

async function confirmImport() {
  if (!importFileContent.value) {
    ElMessage.warning('请先选择文件');
    return;
  }
  importing.value = true;
  try {
    const lines = importFileContent.value.split('\n').filter(line => line.trim());
    let imported = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // 简单解析 protocol://host:port@user:pass 格式
      const match = trimmed.match(/^(https?|socks5):\/\/([^:]+):(\d+)(?:@([^:]+):([^:]+))?$/);
      if (match) {
        const [, protocol, host, port, username, password] = match;
        await window.matrixflow.proxy.create({
          name: `${host}:${port}`,
          protocol,
          host,
          port: parseInt(port),
          username: username || undefined,
          password: password || undefined,
        });
        imported++;
      }
    }
    ElMessage.success(`成功导入 ${imported} 个代理`);
    importDialogVisible.value = false;
    await loadProxies();
  } catch {
    ElMessage.error('导入失败');
  } finally {
    importing.value = false;
  }
}

function handleExport() {
  if (proxies.value.length === 0) {
    ElMessage.warning('暂无代理可导出');
    return;
  }
  const content = proxies.value.map(p => {
    const auth = p.username ? `${p.username}:${p.password}` : '';
    return `${p.protocol}://${p.host}:${p.port}${auth ? '@' + auth : ''}`;
  }).join('\n');
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `proxies_${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  ElMessage.success('导出成功');
}

function openAccountDrawer(proxy: Proxy) {
  currentProxyId.value = proxy.id;
  accountDrawerVisible.value = true;
}

function openAccountSelector() {
  accountSelectorVisible.value = true;
}
</script>

<style scoped>
.proxy-pool-settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.toolbar__tabs {
  display: flex;
  gap: var(--space-1);
  background: var(--color-bg-page);
  border-radius: var(--radius-md);
  padding: var(--space-1);
}

.tab-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.tab-item:hover {
  background: var(--color-bg-hover);
}

.tab-item--active {
  background: var(--color-bg-card);
  box-shadow: var(--shadow-sm);
}

.tab-item__label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.tab-item--active .tab-item__label {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-medium);
}

.tab-item__count {
  font-size: var(--font-size-xs);
  padding: 2px 6px;
  border-radius: 10px;
  background: var(--color-bg-page);
  color: var(--color-text-secondary);
}

.tab-item__count--active {
  background: var(--color-success-light);
  color: var(--color-success);
}

.tab-item__count--inactive {
  background: var(--color-danger-light);
  color: var(--color-danger);
}

.tab-item__count--unchecked {
  background: var(--color-bg-elevated);
  color: var(--color-text-placeholder);
}

.toolbar__actions {
  display: flex;
  gap: var(--space-2);
}

.proxy-grid {
  min-height: 200px;
}

.proxy-col {
  margin-bottom: var(--space-4);
}

.proxy-card {
  cursor: pointer;
  transition: all var(--transition-fast);
  height: 100%;
}

.proxy-card:hover {
  transform: translateY(-2px);
}

.proxy-card__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.proxy-card__status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.proxy-card__status-dot--active {
  background: #52c41a;
  box-shadow: 0 0 6px rgba(82, 196, 26, 0.4);
}

.proxy-card__status-dot--inactive {
  background: #ff4d4f;
}

.proxy-card__status-dot--unchecked {
  background: #999;
}

.proxy-card__name {
  flex: 1;
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.proxy-card__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.proxy-card__address {
  font-size: var(--font-size-sm);
  color: var(--color-text-regular);
  font-family: monospace;
}

.proxy-card__meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.proxy-card__accounts {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.proxy-card__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-1);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border-light);
}

.import-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.import-dialog :deep(.el-upload) {
  width: 100%;
}

.import-dialog :deep(.el-upload-dragger) {
  width: 100%;
  padding: var(--space-6);
}
</style>