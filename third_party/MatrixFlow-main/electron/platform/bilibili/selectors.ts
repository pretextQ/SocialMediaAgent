/**
 * 哔哩哔哩（B站）平台选择器配置
 *
 * 注意：这些选择器基于哔哩哔哩创作者中心页面结构，可能随平台更新而变化。
 * 如果操作失败，需要重新验证并更新选择器。
 *
 * 哔哩哔哩创作者中心: https://member.bilibili.com/platform/home
 */

export const BILIBILI_URLS = {
  creatorHome: 'https://member.bilibili.com/platform/home',
  upload: 'https://member.bilibili.com/platform/upload/video/frame',
  contentManage: 'https://member.bilibili.com/platform/upload-manager/article',
  loginPage: 'https://passport.bilibili.com/login',
  statsOverview: 'https://member.bilibili.com/platform/data-view/home',
  statsContent: 'https://member.bilibili.com/platform/data-view/article',
} as const;

// ---- 登录相关选择器 ----
export const LOGIN_SELECTORS = {
  // 扫码登录 tab
  scanLoginTab: 'get_by_text("扫码登录", exact=false).first',
  // 二维码图片
  qrCodeImage: '.qrcode-img img, .login-qrcode img, img.qrcode, img[src*="qr"], img[src*="qrcode"]',
  // 二维码容器（用于截图）
  qrCodeContainer: '.qrcode-img, .login-qrcode, .qrcode-box, .qr-code',
  // 登录状态检测 —— 出现这些说明未登录
  phoneLoginText: 'get_by_text("手机登录")',
  scanLoginText: 'get_by_text("扫码登录")',
  // 二维码过期提示
  qrExpiredText: 'get_by_text("二维码已失效")',
  qrRefreshBtn: '.qr-refresh, button:has-text("点击刷新"), .qrcode-refresh',
  // 登录成功后页面标识
  avatarIndicator: '.user-avatar, .avatar, [class*="avatar"], [class*="user-img"]',
  usernameText: '.user-name, .nickname, [class*="username"], [class*="nick-name"], [class*="header-username"]',
} as const;

// ---- 上传/发布相关选择器 ----
export const UPLOAD_SELECTORS = {
  // 视频上传入口
  videoUploadArea: '.upload-area, .upload-btn, [class*="upload"]',
  // 文件 input
  videoFileInput: 'input[type="file"][accept*="video"], input[type="file"]',
  // 上传进度
  uploadProgress: '.upload-progress, [class*="progress"], [class*="upload-status"]',
  uploadSuccessText: 'get_by_text("上传成功", exact=false)',
  uploadFailedText: 'get_by_text("上传失败", exact=false)',
  uploadRetryBtn: 'button:has-text("重新上传"), a:has-text("重新上传")',

  // 标题
  titleInput: 'input[placeholder*="标题"], input[placeholder*="填写标题"], .title-input input, [class*="title-input"] input',
  titleInputFallback: '[class*="title"] input, [class*="title"] textarea',

  // 描述/正文
  descEditor: '.desc-input textarea, [contenteditable="true"], [class*="desc"] textarea, [class*="description"] textarea',
  descEditorFallback: '.desc-input, [class*="description"] textarea, [class*="editor"]',

  // 话题/标签 — 基于 # + 空格触发建议下拉
  topicInput: 'input[placeholder*="话题"], input[placeholder*="标签"], [class*="topic"] input, [class*="tag"] input',
  topicSuggestion: '[class*="tag-suggestion"], [class*="topic-item"], [class*="mention-item"], [class*="suggest"] li, [class*="topic"] li',
  topicTag: '.topic-tag, [class*="tag"] span',

  // 封面
  coverSelectBtn: 'get_by_text("设置封面", exact=false), button:has-text("封面")',
  coverModal: '.cover-modal, [class*="cover-modal"], [class*="cover-dialog"]',
  coverUploadInput: 'input[type="file"][accept*="image"]',
  coverConfirmBtn: 'button:has-text("确定"), button:has-text("完成"), button:has-text("确认")',
  coverAutoSelect: '.cover-auto, [class*="auto-cover"], [class*="recommend-cover"]',

  // 发布按钮
  publishButton: 'button:has-text("发布"), button:has-text("发表"), button:has-text("投稿")',
  publishButtonPrimary:
    'button.publish-btn, [class*="publish-btn"], [class*="submit-btn"], [class*="release-btn"]',

  // 发布结果提示
  publishSuccessToast: 'get_by_text("发布成功", exact=false)',
  publishFailedToast: 'get_by_text("发布失败", exact=false)',
  publishDraftToast: 'get_by_text("已保存草稿", exact=false)',

  // 定时发布 — Ant Design picker
  scheduleCheckbox: '[class*="schedule"] input, [class*="timer"] input',
  scheduleDatePicker: 'div.ant-picker-input input[placeholder*="时间"], div.ant-picker-input input[placeholder*="日期"], input[placeholder*="发布时间"], input[placeholder*="日期"], input[placeholder*="时间"], input[type="datetime-local"]',
  scheduleConfirmBtn: 'span:has-text("确定"), button:has-text("确定"), button:has-text("确认")',
} as const;

// ---- 数据统计选择器 ----
export const STATS_SELECTORS = {
  // 概览页
  totalPlayCount: '[class*="play-count"], [class*="playCount"]',
  totalLikeCount: '[class*="like-count"], [class*="likeCount"]',
  totalCommentCount: '[class*="comment-count"], [class*="commentCount"]',
  totalShareCount: '[class*="share-count"], [class*="shareCount"]',
  totalCollectCount: '[class*="collect-count"], [class*="collectCount"], [class*="fan-count"]',
  // 数据卡片
  statCard: '.stat-card, [class*="data-card"], [class*="stat-item"]',
  // 时间筛选
  dateRangePicker: '.date-range, [class*="date-picker"], [class*="calendar"]',
  dateRangeOptions: '.date-option, [class*="date"] li',
} as const;

// ---- URL 模式匹配 ----
export const PUBLISH_URL_PATTERNS = {
  publishPage: '/platform/upload/video/frame',
  contentManage: '/platform/upload-manager',
  dataCenter: '/platform/data-view/',
} as const;
