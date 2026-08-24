import { Logger } from '../core/Logger';
import { getDatabase } from '../data/Database';
import { publishService } from './PublishService';

const logger = new Logger('DraftService');

type DraftStatus = 'editing' | 'ready';

interface PlatformConfig {
  accountId: string;
  platform: string;
  title?: string;
  description?: string;
  tags?: string[];
  topics?: string[];
  coverUrl?: string;
  visibility?: 'public' | 'private' | 'followers';
  declaration?: string;
  scheduleMode?: 'immediate' | 'scheduled';
  scheduledAt?: string;
  allowComment?: boolean;
  allowShare?: boolean;
  allowDownload?: boolean;
  showInCity?: boolean;
}

interface DraftAccount {
  accountId: string;
  platform: string;
  accountName: string;
}

interface VideoPublishSnapshot {
  materialId: string;
  materialPath: string;
  coverPath?: string;
  title?: string;
  description?: string;
  tags?: string[];
  accounts?: DraftAccount[];
  platformConfigs: PlatformConfig[];
  scheduledTime?: string;
}

interface DraftRow {
  id: string;
  title: string;
  material_id: string;
  status: string;
  snapshot_json: string;
  source_draft_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Draft {
  id: string;
  title: string;
  materialId: string;
  status: DraftStatus;
  snapshotJson: VideoPublishSnapshot;
  sourceDraftId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DraftListFilter {
  status?: DraftStatus;
  materialId?: string;
  limit?: number;
  offset?: number;
}

class DraftService {
  private static instance: DraftService;

  private constructor() {}

  static getInstance(): DraftService {
    if (!DraftService.instance) {
      DraftService.instance = new DraftService();
    }
    return DraftService.instance;
  }

  saveDraft(snapshot: VideoPublishSnapshot, existingId?: string): Draft {
    const db = getDatabase();
    const now = new Date();
    const id = existingId ?? `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const title = snapshot.title;
    const materialId = snapshot.materialId;
    const snapshotJson = JSON.stringify(snapshot);
    const sourceDraftId: string | null = existingId ? null : null;

    db.prepare(`
      INSERT INTO drafts (id, title, material_id, status, snapshot_json, source_draft_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        material_id = excluded.material_id,
        status = excluded.status,
        snapshot_json = excluded.snapshot_json,
        source_draft_id = excluded.source_draft_id,
        updated_at = excluded.updated_at
    `).run(
      id,
      title,
      materialId,
      'editing',
      snapshotJson,
      sourceDraftId,
      now.toISOString(),
      now.toISOString()
    );

    logger.info(`草稿已保存: ${id}`);
    return this.getDraft(id)!;
  }

  getDraft(id: string): Draft | null {
    const db = getDatabase();

    const row = db.prepare(`
      SELECT id, title, material_id, status, snapshot_json, source_draft_id, created_at, updated_at
      FROM drafts WHERE id = ?
    `).get(id) as DraftRow | undefined;

    if (!row) return null;

    return this.rowToDraft(row);
  }

  listDrafts(filter?: DraftListFilter): Draft[] {
    const db = getDatabase();

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter?.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter?.materialId) {
      conditions.push('material_id = ?');
      params.push(filter.materialId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter?.limit ?? 100;
    const offset = filter?.offset ?? 0;

    const sql = `SELECT id, title, material_id, status, snapshot_json, source_draft_id, created_at, updated_at
      FROM drafts ${where}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?`;

    const rows = db.prepare(sql).all(...params, limit, offset) as DraftRow[];
    return rows.map(row => this.rowToDraft(row));
  }

  deleteDraft(id: string): boolean {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM drafts WHERE id = ?').run(id);
    if (result.changes > 0) {
      logger.info(`草稿已删除: ${id}`);
      return true;
    }
    return false;
  }

  async publishDraft(id: string): Promise<void> {
    const draft = this.getDraft(id);
    if (!draft) throw new Error(`草稿不存在: ${id}`);
    if (draft.status !== 'editing') throw new Error(`草稿状态不允许发布: ${draft.status}`);

    const snapshot = draft.snapshotJson;

    for (const config of snapshot.platformConfigs) {
      const task = await publishService.createPublishTask({
        contentId: snapshot.materialId,
        platform: config.platform,
        accountId: config.accountId,
        publishMode: 'server',
        headless: false,
        title: config.title ?? snapshot.title ?? '',
        description: config.description ?? snapshot.description ?? '',
        tags: config.tags ?? [],
        coverUrl: config.coverUrl || snapshot.coverPath || undefined,
        source: 'draft',
        metadata: {
          title: config.title ?? snapshot.title,
          description: config.description ?? snapshot.description,
          tags: config.tags,
          visibility: config.visibility,
          declaration: config.declaration,
        },
      });
      publishService.executeNow(task.id).catch(err => {
        logger.error(`[publishDraft] 自动执行失败 taskId=${task.id}: ${err}`);
      });
    }

    const db = getDatabase();
    db.prepare(`UPDATE drafts SET status = 'ready', updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);

    logger.info(`草稿已发布: ${id}`);
  }

  revokeDraft(id: string): void {
    const db = getDatabase();
    const result = db.prepare(`UPDATE drafts SET status = 'editing', updated_at = ? WHERE id = ? AND status = 'ready'`)
      .run(new Date().toISOString(), id);
    if (result.changes === 0) {
      throw new Error(`草稿状态不允许撤回或不存在: ${id}`);
    }
    logger.info(`草稿已撤回: ${id}`);
  }

  private rowToDraft(row: DraftRow): Draft {
    return {
      id: row.id,
      title: row.title,
      materialId: row.material_id,
      status: row.status as DraftStatus,
      snapshotJson: JSON.parse(row.snapshot_json) as VideoPublishSnapshot,
      sourceDraftId: row.source_draft_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const draftService = DraftService.getInstance();
