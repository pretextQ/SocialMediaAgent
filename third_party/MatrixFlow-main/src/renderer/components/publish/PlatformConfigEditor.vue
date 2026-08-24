<template>
  <div class="config-area">
    <div class="config-header">
      <span class="platform-badge" :style="{ background: platformColor, color: '#fff' }">
        {{ platformShort }}
      </span>
      <span class="platform-title">{{ platformLabel }} · {{ account.nickname }}</span>
    </div>

    <div class="config-section">
      <h4>封面设置</h4>
      <div class="form-group">
        <label class="form-label">封面 ({{ coverRatioLabel }})</label>
        <div
          class="cover-area"
          :class="{ 'cover-area--has-image': !!localConfig.coverUrl }"
          @click="handleCoverClick"
        >
          <img
            v-if="localConfig.coverUrl"
            :src="localConfig.coverUrl"
            class="cover-area__image"
          />
          <div v-else class="cover-area__placeholder">
            <el-icon :size="24" color="var(--color-text-placeholder)"><Plus /></el-icon>
            <span>点击上传封面</span>
            <span class="cover-area__hint">支持 JPG / PNG</span>
          </div>
          <div v-if="localConfig.coverUrl" class="cover-area__overlay">
            <el-icon :size="16"><Edit /></el-icon>
            <span>更换封面</span>
          </div>
        </div>
        <el-button
          v-if="localConfig.coverUrl"
          size="small"
          text
          type="danger"
          class="cover-remove-btn"
          @click="handleRemoveCover"
        >
          移除封面
        </el-button>
      </div>
    </div>

    <div class="config-section">
      <h4>基础内容</h4>
      <div class="form-group">
        <label class="form-label">
          标题
          <span class="form-hint">{{ titleHint }}</span>
        </label>
        <input
          v-model="localConfig.title"
          type="text"
          class="form-input"
          :placeholder="`输入${platformLabel}标题`"
          :maxlength="titleLimit"
          autocomplete="off"
          @input="handleTitleInput"
        />
        <div v-if="titleValidationError" class="form-error">{{ titleValidationError }}</div>
      </div>
    </div>

    <div class="config-section">
      <h4>内容描述</h4>
      <div class="form-group">
        <label class="form-label">
          视频描述
          <span class="form-hint">最多{{ descLimit }}字</span>
        </label>
        <textarea
          v-model="localConfig.description"
          class="form-textarea"
          rows="4"
          :placeholder="`输入${platformLabel}视频描述`"
          :maxlength="descLimit"
          @input="emitUpdate"
        ></textarea>
      </div>
    </div>

    <div class="config-section">
      <div class="form-group">
        <label class="form-label">话题标签</label>
        <div class="tag-input" @click="focusTagInput">
          <span v-for="(tag, index) in localConfig.tags" :key="index" class="chip">
            {{ tag.startsWith('#') ? tag : '#' + tag }}
            <span class="chip-remove" @click.stop="removeTag(index)">×</span>
          </span>
          <input
            ref="tagInputRef"
            v-model="tagInput"
            class="tag-input-field"
            placeholder="添加话题"
            @keydown.enter.prevent="addTag"
            @keydown.backspace="handleTagBackspace"
            @input="emitUpdate"
          />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">
          {{ platform === 'channels' ? '选择位置' : '添加地点' }}
          <span v-if="platform === 'channels'" class="form-hint">留空时自动选择“不显示位置”</span>
        </label>
        <input
          v-model="localConfig.location"
          type="text"
          class="form-input"
          :placeholder="platform === 'channels' ? '输入地点名称，留空则不显示位置' : '添加地点'"
          autocomplete="off"
          @input="emitUpdate"
        />
      </div>
    </div>

    <div v-if="platform === 'xiaohongshu'" class="config-section">
      <div class="form-group">
        <label class="form-label">添加内容类型声明</label>
        <select v-model="localConfig.declaration" class="form-select" @change="emitUpdate">
          <option value="0">无需声明</option>
          <option value="1">虚构演绎，仅供娱乐</option>
          <option value="2">笔记含AI合成内容</option>
          <option value="3">内容包含营销广告</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">可见范围</label>
        <div class="radio-group">
          <label class="radio-item">
            <input type="radio" v-model="localConfig.visibility" value="public" @change="emitUpdate" />
            <span>公开可见</span>
          </label>
          <label class="radio-item">
            <input type="radio" v-model="localConfig.visibility" value="private" @change="emitUpdate" />
            <span>仅自己可见</span>
          </label>
          <label class="radio-item">
            <input type="radio" v-model="localConfig.visibility" value="friends" @change="emitUpdate" />
            <span>仅互关好友可见</span>
          </label>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">定时发布</label>
        <div class="radio-group">
          <label class="radio-item">
            <input type="radio" v-model="localConfig.scheduleMode" value="immediate" @change="emitUpdate" />
            <span>立即发布</span>
          </label>
          <label class="radio-item">
            <input type="radio" v-model="localConfig.scheduleMode" value="scheduled" @change="emitUpdate" />
            <span>定时发布</span>
          </label>
          <input
            v-if="localConfig.scheduleMode === 'scheduled'"
            v-model="localConfig.scheduledAt"
            type="datetime-local"
            class="schedule-inline"
            @input="emitUpdate"
          />
        </div>
      </div>
    </div>

    <div v-if="platform === 'douyin'" class="config-section">
      <h4>抖音专属</h4>
      <div class="form-group">
        <label class="form-label">添加内容类型声明</label>
        <select v-model="localConfig.declaration" class="form-select" @change="emitUpdate">
          <option value="none">无需添加自主声明</option>
          <option value="ai_generated">内容由AI生成</option>
          <option value="personal_opinion">内容为个人观点或见解</option>
          <option value="repost">内容为转载信息</option>
          <option value="marketing">内容含营销推广信息</option>
          <option value="fictional">虚构演绎，仅供娱乐</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">谁可以看</label>
        <div class="radio-group">
          <label class="radio-item">
            <input type="radio" v-model="localConfig.visibility" value="public" @change="emitUpdate" />
            <span>公开</span>
          </label>
          <label class="radio-item">
            <input type="radio" v-model="localConfig.visibility" value="friends" @change="emitUpdate" />
            <span>好友可看</span>
          </label>
          <label class="radio-item">
            <input type="radio" v-model="localConfig.visibility" value="private" @change="emitUpdate" />
            <span>仅自己可见</span>
          </label>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">保存权限</label>
        <div class="radio-group">
          <label class="radio-item">
            <input type="radio" v-model="localConfig.allowDownload" :value="true" @change="emitUpdate" />
            <span>允许保存</span>
          </label>
          <label class="radio-item">
            <input type="radio" v-model="localConfig.allowDownload" :value="false" @change="emitUpdate" />
            <span>不允许保存</span>
          </label>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">发布时间</label>
        <div class="radio-group">
          <label class="radio-item">
            <input type="radio" v-model="localConfig.scheduleMode" value="immediate" @change="emitUpdate" />
            <span>立即发布</span>
          </label>
          <label class="radio-item">
            <input type="radio" v-model="localConfig.scheduleMode" value="scheduled" @change="emitUpdate" />
            <span>定时发布</span>
          </label>
          <input
            v-if="localConfig.scheduleMode === 'scheduled'"
            v-model="localConfig.scheduledAt"
            type="datetime-local"
            class="schedule-inline"
            @input="emitUpdate"
          />
        </div>
        <span class="form-hint">定时发布最多 30 天</span>
      </div>
      <div class="form-group">
        <label class="form-label">互动设置</label>
        <div class="checkbox-group">
          <label class="checkbox-item">
            <input v-model="localConfig.allowComment" type="checkbox" @change="emitUpdate" />
            <span>允许评论</span>
          </label>
        </div>
      </div>
    </div>

    <!-- 视频号专属配置 -->
    <div v-if="platform === 'channels'" class="config-section">
      <h4>视频号专属</h4>
      <div class="form-group">
        <label class="form-label">定时发表</label>
        <div class="radio-group">
          <label class="radio-item">
            <input type="radio" v-model="localConfig.scheduleMode" value="immediate" @change="emitUpdate" />
            <span>立即发表</span>
          </label>
          <label class="radio-item">
            <input type="radio" v-model="localConfig.scheduleMode" value="scheduled" @change="emitUpdate" />
            <span>定时发表</span>
          </label>
          <input
            v-if="localConfig.scheduleMode === 'scheduled'"
            v-model="localConfig.scheduledAt"
            type="datetime-local"
            step="60"
            class="schedule-inline"
            @input="emitUpdate"
          />
        </div>
        <span class="form-hint">视频号定时发表需提前 2 小时以上，最多 7 天</span>
      </div>
      <div class="form-group">
        <label class="form-label">声明原创</label>
        <div class="radio-group">
          <label class="radio-item">
            <input
              type="checkbox"
              :checked="isOriginal === true"
              @change="handleIsOriginalChange($event)"
            />
            <span>声明视频为原创（需阅读并同意《视频号原创声明使用条款》）</span>
          </label>
        </div>
      </div>
      <!-- 视频号不支持自动评论，不显示评论配置 -->
    </div>

    <div v-if="platform === 'kuaishou'" class="config-section">
      <div class="form-group">
        <label class="form-label">作者声明</label>
        <select v-model="localConfig.declaration" class="form-select" @change="emitUpdate">
          <option value="">无需声明</option>
          <option value="ai_generated">内容为AI生成</option>
          <option value="fictional">演绎情节，仅供娱乐</option>
          <option value="personal_opinion">个人观点，仅供参考</option>
          <option value="repost">素材来源于网络</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">查看权限</label>
        <div class="radio-group">
          <label class="radio-item">
            <input type="radio" v-model="localConfig.visibility" value="public" @change="emitUpdate" />
            <span>所有人可见</span>
          </label>
          <label class="radio-item">
            <input type="radio" v-model="localConfig.visibility" value="private" @change="emitUpdate" />
            <span>仅自己可见</span>
          </label>
          <label class="radio-item">
            <input type="radio" v-model="localConfig.visibility" value="friends" @change="emitUpdate" />
            <span>好友可见</span>
          </label>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">发布时间</label>
        <div class="radio-group">
          <label class="radio-item">
            <input type="radio" v-model="localConfig.scheduleMode" value="immediate" @change="emitUpdate" />
            <span>立即发布</span>
          </label>
          <label class="radio-item">
            <input type="radio" v-model="localConfig.scheduleMode" value="scheduled" @change="emitUpdate" />
            <span>定时发布</span>
          </label>
          <input
            v-if="localConfig.scheduleMode === 'scheduled'"
            v-model="localConfig.scheduledAt"
            type="datetime-local"
            class="schedule-inline"
            @input="emitUpdate"
          />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">互动设置</label>
        <div class="checkbox-group">
          <label class="checkbox-item">
            <input v-model="localConfig.allowSameFrame" type="checkbox" @change="emitUpdate" />
            <span>允许别人跟我同拍</span>
          </label>
          <label class="checkbox-item">
            <input v-model="localConfig.allowDownload" type="checkbox" @change="emitUpdate" />
            <span>允许下载此作品</span>
          </label>
          <label class="checkbox-item">
            <input v-model="localConfig.showInCity" type="checkbox" @change="emitUpdate" />
            <span>作品展示在同城页</span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { Plus, Edit } from '@element-plus/icons-vue';
import type { Account } from '@/renderer/stores/account';

interface PlatformConfig {
  title?: string;
  description?: string;
  tags?: string[];
  coverUrl?: string;
  coverRatio?: string;
  location?: string;
  visibility?: string;
  declaration?: string;
  scheduleMode?: 'immediate' | 'scheduled';
  scheduledAt?: string;
  allowComment?: boolean;
  allowShare?: boolean;
  allowSameFrame?: boolean;
  allowDownload?: boolean;
  showInCity?: boolean;
  isOriginal?: boolean;
}

interface CommonConfig {
  title: string;
  description: string;
  tags: string[];
  scheduleMode: 'immediate' | 'scheduled';
  scheduledAt?: string;
}

const props = defineProps<{
  account: Account;
  platformConfig: PlatformConfig;
  commonConfig: CommonConfig;
}>();

const emit = defineEmits<{
  'update:platform-config': [config: PlatformConfig];
}>();

const localConfig = reactive<PlatformConfig>({
  visibility: 'public',
  scheduleMode: 'immediate',
  allowComment: true,
  allowShare: true,
  allowDownload: true,
  allowSameFrame: false,
  showInCity: true,
  isOriginal: false,
  location: '',
  ...props.platformConfig,
  declaration: props.platformConfig.declaration || '0',
});
const tagInput = ref('');
const tagInputRef = ref<HTMLInputElement | null>(null);

const platformInfo: Record<string, { label: string; color: string; short: string }> = {
  xiaohongshu: { label: '小红书', color: '#FF2442', short: '红' },
  douyin: { label: '抖音', color: '#000000', short: '音' },
  bilibili: { label: 'B站', color: '#FB7299', short: 'B' },
  channels: { label: '视频号', color: '#07C160', short: '视' },
  kuaishou: { label: '快手', color: '#FF4906', short: '快' },
  weibo: { label: '微博', color: '#E6162D', short: '博' },
  zhihu: { label: '知乎', color: '#0066FF', short: '知' },
};

const platform = computed(() => props.account.platform);
const platformLabel = computed(() => platformInfo[platform.value]?.label || platform.value);
const platformColor = computed(() => platformInfo[platform.value]?.color || '#909399');
const platformShort = computed(() => platformInfo[platform.value]?.short || platform.value[0]?.toUpperCase() || '?');

const coverRatioLabel = computed(() => {
  const ratios: Record<string, string> = {
    '3:4': '3:4 竖版',
    '16:9': '16:9 横版',
    '1:1': '1:1 方版',
  };
  return ratios[localConfig.coverRatio || '3:4'] || '3:4 竖版';
});

const titleLimit = computed(() => {
  if (platform.value === 'channels') return 16;
  if (platform.value === 'xiaohongshu') return 20;
  if (platform.value === 'douyin') return 40;
  if (platform.value === 'bilibili') return 80;
  return 100;
});

const descLimit = computed(() => {
  if (platform.value === 'xiaohongshu') return 1000;
  if (platform.value === 'douyin') return 2000;
  return 5000;
});

const titleMinLen = 6;
const titleForbiddenChars = /[^\u4e00-\u9fa5a-zA-Z0-9]/;

const titleValidationError = computed(() => {
  if (platform.value !== 'channels') return '';
  const value = (localConfig.title || '').trim();
  if (value.length === 0) return '';
  if (value.length > titleLimit.value) return `视频号标题最多 ${titleLimit.value} 字，当前 ${value.length} 字`;
  if (value.length < titleMinLen) return `视频号标题至少 ${titleMinLen} 字，当前 ${value.length} 字`;
  if (titleForbiddenChars.test(value)) return '视频号标题不能包含标点符号或特殊字符';
  return '';
});

const titleHint = computed(() => {
  if (platform.value === 'channels') {
    return `6-16 字，仅中文/英文/数字，不可含标点符号，覆盖公共标题`;
  }
  return `最多 ${titleLimit.value} 字，覆盖公共标题`;
});

const isOriginal = computed(
  () => localConfig.isOriginal === true || localConfig.declaration === 'original',
);

function handleTitleInput(event: Event) {
  const inputEl = event.target as HTMLInputElement & { composing?: boolean };
  if ((event as InputEvent).isComposing || inputEl.composing) return;

  let value = inputEl.value;

  if (platform.value === 'channels') {
    const sanitized = value.replace(titleForbiddenChars, '');
    if (sanitized !== value) {
      value = sanitized;
      inputEl.value = sanitized;
    }
  }
  localConfig.title = value;
  emitUpdate();
}

function handleIsOriginalChange(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  localConfig.isOriginal = checked;
  localConfig.declaration = checked ? 'original' : '';
  emitUpdate();
}

watch(
  () => props.platformConfig,
  (newVal, oldVal) => {
    if (newVal === oldVal) return;
    if (!newVal || Object.keys(newVal).length === 0) return;
    for (const key of Object.keys(newVal)) {
      const configKey = key as keyof PlatformConfig;
      if (newVal[configKey] !== localConfig[configKey]) {
        (localConfig as any)[configKey] = newVal[configKey];
      }
    }
    // 快手默认值
    if (props.account.platform === 'kuaishou') {
      if (localConfig.visibility === undefined) localConfig.visibility = 'public';
      if (localConfig.allowComment === undefined) localConfig.allowComment = true;
      if (localConfig.allowSameFrame === undefined) localConfig.allowSameFrame = false;
      if (localConfig.allowDownload === undefined) localConfig.allowDownload = false;
      if (localConfig.showInCity === undefined) localConfig.showInCity = true;
    }
    // 抖音默认值
    if (props.account.platform === 'douyin') {
      if (!localConfig.declaration) localConfig.declaration = 'none';
      if (!localConfig.visibility) localConfig.visibility = 'public';
      if (localConfig.allowDownload === undefined) localConfig.allowDownload = true;
      if (localConfig.allowComment === undefined) localConfig.allowComment = true;
      if (!localConfig.scheduleMode) localConfig.scheduleMode = 'immediate';
    }
  },
  { deep: true, immediate: true }
);

async function handleCoverClick() {
  if (!window.matrixflow?.dialog?.openFile) return;
  try {
    const result = await window.matrixflow.dialog.openFile({
      title: '选择封面图片',
      properties: ['openFile'],
      filters: [
        { name: '图片', extensions: ['jpg', 'jpeg', 'png'] },
      ],
    });
    if (result) {
      const filePath = Array.isArray(result) ? result[0] : result;
      if (filePath) {
        localConfig.coverUrl = `local-file://${filePath}`;
        emitUpdate();
      }
    }
  } catch {
    // 用户取消或失败
  }
}

function handleRemoveCover() {
  localConfig.coverUrl = undefined;
  emitUpdate();
}

function emitUpdate() {
  emit('update:platform-config', { ...localConfig });
}

function focusTagInput() {
  tagInputRef.value?.focus();
}

function addTag() {
  const tag = tagInput.value.trim();
  if (tag && !(localConfig.tags || []).includes(tag)) {
    if (!localConfig.tags) localConfig.tags = [];
    localConfig.tags.push(tag);
    emitUpdate();
  }
  tagInput.value = '';
}

function removeTag(index: number) {
  localConfig.tags?.splice(index, 1);
  emitUpdate();
}

function handleTagBackspace() {
  if (tagInput.value === '' && (localConfig.tags?.length ?? 0) > 0) {
    localConfig.tags?.pop();
    emitUpdate();
  }
}
</script>

<style scoped>
.config-area {
  flex: 1;
  background: var(--color-bg-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  overflow-y: auto;
  padding: var(--space-4);
}

.config-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--space-4);
}

.platform-badge {
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-3xs);
}

.platform-title {
  color: var(--color-text-primary);
}

.config-section {
  margin-bottom: var(--space-4);
}

.config-section:last-child {
  margin-bottom: 0;
}

.config-section h4 {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-placeholder);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-border);
}

.form-group {
  margin-bottom: var(--space-3);
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-1);
}

.form-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  font-weight: var(--font-weight-normal);
}

.form-input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: var(--shadow-focus);
}

.form-textarea {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  resize: vertical;
  min-height: 60px;
  box-sizing: border-box;
}

.form-textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: var(--shadow-focus);
}

.form-select {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  background: var(--color-bg-card);
  cursor: pointer;
}

.form-select:focus {
  outline: none;
  border-color: var(--color-primary);
}

/* ── 封面区域 ── */
.cover-area {
  position: relative;
  width: 100%;
  min-height: 120px;
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s;
}

.cover-area:hover {
  border-color: var(--color-primary);
}

.cover-area--has-image {
  border-style: solid;
}

.cover-area__image {
  width: 100%;
  max-height: 260px;
  object-fit: contain;
  display: block;
  background: var(--color-bg-page);
}

.cover-area__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  color: var(--color-text-placeholder);
  gap: var(--space-1);
  font-size: var(--font-size-sm);
}

.cover-area__hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
}

.cover-area__overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  color: #fff;
  font-size: var(--font-size-sm);
  opacity: 0;
  transition: opacity 0.15s;
}

.cover-area:hover .cover-area__overlay {
  opacity: 1;
}

.cover-remove-btn {
  margin-top: var(--space-1);
}

.tag-input {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  min-height: 32px;
  align-items: center;
  cursor: text;
}

.tag-input:focus-within {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-focus);
}

.chip {
  padding: 1px 6px;
  font-size: var(--font-size-xs);
  background: var(--color-primary-lighter);
  color: var(--color-primary);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  gap: 2px;
}

.chip-remove {
  cursor: pointer;
  margin-left: 2px;
}

.chip-remove:hover {
  color: var(--color-danger);
}

.tag-input-field {
  border: none;
  outline: none;
  font-size: var(--font-size-sm);
  flex: 1;
  min-width: 60px;
  font-family: var(--font-family);
  background: transparent;
}

.checkbox-group {
  display: flex;
  flex-direction: row;
  gap: var(--space-4);
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.checkbox-item input[type="checkbox"] {
  accent-color: var(--color-primary);
}

.radio-group {
  display: flex;
  flex-direction: row;
  gap: var(--space-4);
}

.radio-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.radio-item input[type="radio"] {
  accent-color: var(--color-primary);
}

.schedule-inline {
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  background: var(--color-bg-card);
  color: var(--color-text-primary);
}

.schedule-inline:focus {
  outline: none;
  border-color: var(--color-primary);
}
</style>
