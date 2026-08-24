import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface PublishRule {
  platforms: string[];
  timeSlots: string[];
  randomOffsetMin: number;
  dailyCount: number;
  publishMode: 'server' | 'client';
  publishOrder: 'upload_order' | 'random' | 'manual';
  restDays: string[];
  isActive: boolean;
  // Legacy fields (backward compat)
  publishStartTime: string;
  publishEndTime: string;
  intervalMinutes: number;
  dailyLimit: number;
  randomDelay: boolean;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  color: string;
  accountIds: string[];
  accountCount: number;
  publishRule: PublishRule;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface GroupFromBackend {
  id: string;
  name: string;
  description?: string;
  color: string;
  accountCount: number;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const defaultPublishRule: PublishRule = {
  platforms: [],
  timeSlots: ['09:00', '12:00', '18:00'],
  randomOffsetMin: 10,
  dailyCount: 3,
  publishMode: 'client',
  publishOrder: 'upload_order',
  restDays: [],
  isActive: true,
  publishStartTime: '08:00',
  publishEndTime: '22:00',
  intervalMinutes: 30,
  dailyLimit: 10,
  randomDelay: true,
};

export interface RuleTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  dailyCount: number;
  timeSlots: string[];
  randomOffsetMin: number;
}

export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: 'aggressive',
    name: '激进型',
    icon: '🔥',
    description: '每天5条，覆盖全天时段',
    dailyCount: 5,
    timeSlots: ['08:00', '10:00', '14:00', '17:00', '21:00'],
    randomOffsetMin: 15,
  },
  {
    id: 'steady',
    name: '稳健型',
    icon: '⚡',
    description: '每天3条，黄金时段发布',
    dailyCount: 3,
    timeSlots: ['09:00', '12:00', '18:00'],
    randomOffsetMin: 10,
  },
  {
    id: 'conservative',
    name: '保守型',
    icon: '🌿',
    description: '每天1条，午间精选',
    dailyCount: 1,
    timeSlots: ['12:00'],
    randomOffsetMin: 5,
  },
];

export const REST_DAY_OPTIONS = [
  { label: '周一', value: 'monday' },
  { label: '周二', value: 'tuesday' },
  { label: '周三', value: 'wednesday' },
  { label: '周四', value: 'thursday' },
  { label: '周五', value: 'friday' },
  { label: '周六', value: 'saturday' },
  { label: '周日', value: 'sunday' },
];

const GROUP_COLORS = [
  '#db4b4b',
  '#e8993d',
  '#37b36e',
  '#2974e0',
  '#8a95a5',
  '#7f52b8',
  '#29b89d',
  '#e04040',
];

function getRandomColor(): string {
  return GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
}

export const useGroupStore = defineStore('group', () => {
  const groups = ref<Group[]>([]);
  const loading = ref(false);

  const groupCount = computed(() => groups.value.length);

  async function fetchGroups() {
    if (!window.matrixflow) return;
    loading.value = true;
    try {
      const list = await window.matrixflow.groups.list();
      const backendGroups = list as GroupFromBackend[];
      groups.value = backendGroups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        color: g.color,
        accountIds: [],
        accountCount: g.accountCount || 0,
        publishRule: defaultPublishRule,
        sortOrder: g.sortOrder,
        createdAt: g.createdAt instanceof Date ? g.createdAt.toISOString() : String(g.createdAt),
        updatedAt: g.updatedAt instanceof Date ? g.updatedAt.toISOString() : String(g.updatedAt),
      }));
    } finally {
      loading.value = false;
    }
  }

  async function createGroup(data: { name: string; accountIds?: string[] }) {
    if (!window.matrixflow) return;
    const result = await window.matrixflow.groups.create({
      name: data.name,
      description: '',
      color: getRandomColor(),
    });
    const group = (result as any)?.data ?? result;
    if (group) {
      groups.value.push(group as Group);
    }
    return group;
  }

  async function updateGroup(id: string, data: Partial<Group>) {
    if (!window.matrixflow) return;
    const plainData = JSON.parse(JSON.stringify(data));
    console.log('[groupStore] updateGroup called:', { id, data: plainData });
    try {
      const result = await window.matrixflow.groups.update(id, plainData);
      console.log('[groupStore] updateGroup IPC result:', result);
      const updated = (result as any)?.data ?? result;
      const idx = groups.value.findIndex((g) => g.id === id);
      if (idx >= 0 && updated) {
        groups.value[idx] = { ...groups.value[idx], ...updated } as Group;
      } else if (idx >= 0) {
        groups.value[idx] = { ...groups.value[idx], ...plainData } as Group;
      }
      return updated;
    } catch (err) {
      console.error('[groupStore] updateGroup error:', err);
      throw err;
    }
  }

  async function deleteGroup(id: string) {
    if (!window.matrixflow) return;
    await window.matrixflow.groups.delete(id);
    groups.value = groups.value.filter((g) => g.id !== id);
  }

  async function sortGroups(orderedIds: string[]) {
    if (!window.matrixflow) return;
    orderedIds.forEach((id, index) => {
      const group = groups.value.find((g) => g.id === id);
      if (group) group.sortOrder = index;
    });
    await window.matrixflow.groups.sort(orderedIds);
  }

  async function bindAccounts(groupId: string, accountIds: string[]) {
    if (!window.matrixflow) return;
    await window.matrixflow.groups.bindAccounts(groupId, accountIds);
    const group = groups.value.find((g) => g.id === groupId);
    if (group) {
      group.accountIds = accountIds;
    }
  }

  function getGroupById(id: string): Group | undefined {
    return groups.value.find((g) => g.id === id);
  }

  function getGroupAccountCount(id: string): number {
    const g = groups.value.find((g) => g.id === id);
    if (!g) return 0;
    return g.accountCount ?? g.accountIds?.length ?? 0;
  }

  return {
    groups,
    loading,
    groupCount,
    defaultPublishRule,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    sortGroups,
    bindAccounts,
    getGroupById,
    getGroupAccountCount,
  };
});
