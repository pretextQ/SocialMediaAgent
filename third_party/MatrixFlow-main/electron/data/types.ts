export interface Account {
  id: string;
  platform: string;
  nickname: string | null;
  avatar_url: string | null;
  cookie_path: string;
  cookie_valid: number;
  last_login: string | null;
  last_publish: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface GroupPublishRule {
  id: string;
  group_id: string;
  platform: string;
  publish_interval_min: number;
  daily_limit: number;
  time_slots: string;
  publish_mode: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export type FingerprintPlatform = 'windows' | 'linux' | 'macos';
export type FingerprintBrand = 'Chrome' | 'Edge' | 'Opera' | 'Vivaldi';

export interface FingerprintCustomParam {
  name: string;
  value: string;
}

export interface FingerprintTemplate {
  id: string;
  name: string;
  seed: number | null;
  platform: FingerprintPlatform;
  platform_version: string | null;
  brand: FingerprintBrand;
  brand_version: string | null;
  hardware_concurrency: number | null;
  gpu_vendor: string | null;
  gpu_renderer: string | null;
  disable_non_proxied_udp: number;
  lang: string;
  accept_lang: string;
  timezone: string;
  custom_params: string;
  user_agent: string | null;
  screen_width: number;
  screen_height: number;
  created_at: string;
  updated_at: string;
}

export interface Proxy {
  id: string;
  name: string;
  protocol: string;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  status: string;
  last_check_at: string | null;
  last_check_result: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformConfig {
  id: string;
  platform: string;
  config_key: string;
  config_value: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface Content {
  id: string;
  type: string;
  title: string;
  description: string;
  file_path: string;
  thumbnail_path: string | null;
  duration: number | null;
  size: number | null;
  tags: string;
  metadata: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PublishTask {
  id: string;
  content_id: string;
  group_id: string | null;
  platform: string;
  account_id: string | null;
  proxy_id: string | null;
  fingerprint_id: string | null;
  scheduled_at: string | null;
  publish_mode: string;
  status: string;
  result: string | null;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
  updated_at: string;
}

export interface TaskItem {
  id: string;
  task_id: string;
  account_id: string;
  platform: string;
  status: string;
  platform_video_id: string | null;
  publish_url: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Draft {
  id: string;
  content_id: string | null;
  platform: string;
  title: string;
  description: string;
  tags: string;
  cover_path: string | null;
  extra_data: string;
  created_at: string;
  updated_at: string;
}

export interface VideoStat {
  id: string;
  task_item_id: string | null;
  platform: string;
  platform_video_id: string;
  play_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  collect_count: number;
  fetch_time: string;
  created_at: string;
}

export interface MonitorPlan {
  id: string;
  name: string;
  platform: string;
  target_type: string;
  target_id: string;
  interval_min: number;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CommentTemplate {
  id: string;
  name: string;
  content: string;
  category: string;
  platform: string;
  usage_count: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface Video {
  id: string;
  account_id: string;
  platform: string;
  platform_video_id: string | null;
  title: string;
  description: string | null;
  tags: string | null;
  cover_path: string | null;
  video_path: string;
  duration: number | null;
  size: number | null;
  status: string;
  publish_mode: string;
  scheduled_at: string | null;
  published_at: string | null;
  publish_url: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface PublishRecord {
  id: string;
  video_id: string;
  account_id: string;
  platform: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
}

export interface Task {
  id: string;
  type: string;
  payload: string;
  status: string;
  priority: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
  updated_at: string;
}

export interface Stat {
  id: number;
  video_id: string;
  platform_video_id: string;
  platform: string;
  play_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  collect_count: number;
  fetch_time: string;
}

export type PaginationOptions = {
  page?: number;
  pageSize?: number;
  orderBy?: string;
  orderDir?: 'ASC' | 'DESC';
};

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};

export interface AccountBinding {
  accountId: string;
  accountName: string;
  accountAvatar?: string;
  platform: string;
  isShared: boolean;
  groupName?: string;
  boundAt: string;
}
