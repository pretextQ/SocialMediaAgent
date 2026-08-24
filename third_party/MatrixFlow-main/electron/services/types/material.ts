/**
 * 素材管理服务类型定义
 *
 * 涵盖素材实体、分组、事件及服务接口。
 * 参考: AccountService 类型分层模式
 */

// ─── 素材实体 ───────────────────────────────────────────────

export type MaterialType = 'image' | 'video' | 'article';
export type MaterialStatus = 'active' | 'deleted';

export interface Material {
  id: string;
  type: MaterialType;
  title: string;
  description?: string;
  filePath: string;
  fileSize: number;
  thumbnailPath?: string;
  platform?: string;
  groupId?: string;
  metadata?: Record<string, unknown>;
  status: MaterialStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface MaterialRow {
  id: string;
  type: string;
  title: string;
  description: string | null;
  file_path: string;
  file_size: number;
  thumbnail_path: string | null;
  platform: string | null;
  group_id: string | null;
  metadata: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

// ─── 数据库行映射 ────────────────────────────────────────────

export interface MaterialRow {
  id: string;
  type: string;
  title: string;
  description: string | null;
  file_path: string;
  thumbnail_path: string | null;
  platform: string | null;
  group_id: string | null;
  metadata: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

// ─── 分组 ────────────────────────────────────────────────────

export interface MaterialGroup {
  id: string;
  name: string;
  color?: string;
  createdAt: Date;
}

export interface MaterialGroupRow {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

// ─── IPC 载荷 ────────────────────────────────────────────────

export interface UploadPayload {
  filePath: string;
  groupId?: string;
  title?: string;
  description?: string;
}

export interface ListQuery {
  groupId?: string;
  type?: MaterialType;
  status?: MaterialStatus;
  page?: number;
  pageSize?: number;
}

export interface ListResult {
  items: Material[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UploadProgressPayload {
  materialId: string;
  progress: number;
  stage: 'validating' | 'uploading' | 'thumbnail' | 'complete';
}

export interface BatchDeleteResult {
  success: string[];
  failed: string[];
}

// ─── 事件名 ──────────────────────────────────────────────────

export enum MaterialEvent {
  /** 素材上传成功 */
  MATERIAL_UPLOADED = 'material:uploaded',
  /** 素材删除 */
  MATERIAL_DELETED = 'material:deleted',
  /** 上传进度更新 */
  UPLOAD_PROGRESS = 'material:upload-progress',
  /** 分组创建 */
  GROUP_CREATED = 'material:group-created',
  /** 分组删除 */
  GROUP_DELETED = 'material:group-deleted',
}

// ─── 服务接口 ────────────────────────────────────────────────

export interface IMaterialService {
  // CRUD
  listMaterials(query: ListQuery): Promise<ListResult>;
  getMaterial(id: string): Promise<Material | null>;
  uploadMaterial(payload: UploadPayload): Promise<Material>;
  deleteMaterial(id: string): Promise<void>;
  deleteMaterials(ids: string[]): Promise<BatchDeleteResult>;

  // 分组
  listGroups(): Promise<MaterialGroup[]>;
  createGroup(name: string, color?: string): Promise<MaterialGroup>;
  deleteGroup(id: string): Promise<void>;

  // 下载
  downloadMaterials(ids: string[], targetDir: string): Promise<void>;

  // 素材库路径
  getDefaultMaterialLibraryPath(): string;
  getMaterialLibraryPath(): string;
  setMaterialLibraryPath(path: string): Promise<void>;

  // 生命周期
  initialize(): Promise<void>;
  dispose(): void;
}

// ─── 事件载荷 ────────────────────────────────────────────────

export interface MaterialUploadedPayload {
  materialId: string;
  type: MaterialType;
}

export interface MaterialDeletedPayload {
  materialId: string;
}

export interface GroupCreatedPayload {
  groupId: string;
  name: string;
}

// ─── 文件验证 ────────────────────────────────────────────────

export interface FileValidation {
  valid: boolean;
  error?: string;
  type?: MaterialType;
}

export const FILE_VALIDATION = {
  image: {
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    maxSize: 20 * 1024 * 1024, // 20MB
  },
  video: {
    extensions: ['.mp4', '.mov', '.avi'],
    maxSize: 500 * 1024 * 1024, // 500MB
  },
  article: {
    extensions: ['.md', '.txt', '.docx'],
    maxSize: 5 * 1024 * 1024, // 5MB
  },
} as const;
