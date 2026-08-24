export const XHS_URLS = {
  creatorHome: 'https://creator.xiaohongshu.com/',
  publish: 'https://creator.xiaohongshu.com/publish/publish',
  contentManage: 'https://creator.xiaohongshu.com/content/manage',
  loginPage: 'https://creator.xiaohongshu.com/login',
  statsOverview: 'https://creator.xiaohongshu.com/datacenter/overview',
  statsContent: 'https://creator.xiaohongshu.com/datacenter/content',
} as const;

export const LOGIN_SELECTORS = {
  scanLoginTab: 'text="扫码登录"',
  qrCodeImage: '.login-box-container img, [class*="qrcode"] img',
  qrCodeContainer: '[class*="login-box"], .login-box-container',
  phoneLoginText: 'text="手机登录"',
  scanLoginText: 'text="扫码登录"',
  qrExpiredText: 'text="二维码已失效"',
  qrRefreshBtn: '.qrcode-refresh, button:has-text("点击刷新")',
  avatarIndicator: '.user-avatar, .avatar, [class*="avatar"]',
  usernameText: '.user-name, .nickname, [class*="username"]',
  /** 登录框容器 — 竞品用 div[class*='login-box'] 检测登录状态 */
  loginBox: 'div[class*="login-box"]',
  /** 切换到扫码面板的图片按钮 — 竞品用 img.css-wemwzq */
  loginSwitchImg: 'img.css-wemwzq',
} as const;

export const UPLOAD_SELECTORS = {
  videoUploadBtn: 'button:has-text("上传视频"), [class*="upload"] button, [class*="Upload"]',
  videoFileInput: 'input[type="file"][accept*="video"], input[type="file"]',
  imageFileInput: 'input[type="file"][accept*="image"]',
  uploadProgress: '.upload-progress, [class*="progress"]',
  uploadSuccessText: 'text="上传成功"',
  uploadFailedText: 'text="上传失败"',

  titleInput: 'input[placeholder*="标题"], input[placeholder*="填写标题"], #title-textarea',
  titleInputFallback: '.title-input input, [class*="title"] input',

  descEditor: '.ql-editor, [contenteditable="true"], .desc-input, [class*="description"]',
  descEditorFallback: '.c_input_box, .input-box textarea',

  topicInput: 'input[placeholder*="话题"], input[placeholder*="搜索话题"], [class*="topic"] input',
  topicSuggestion: '.topic-item, [class*="topic"] li, [class*="suggest"] li',
  topicTag: '.topic-tag, [class*="tag"] span',

  mentionInput: 'input[placeholder*="@"], input[placeholder*="提及"]',
  mentionSuggestion: '.mention-item, [class*="user-list"] li',

  coverSelectBtn: 'button:has-text("设置封面"), button:has-text("修改封面"), [class*="cover-setting"], [class*="edit-cover"]',
  coverModal: '.cover-modal, [class*="cover-modal"], [class*="cover-dialog"], [class*="cover-section"]',
  coverUploadInput: 'input[type="file"][accept*="image"]',
  coverConfirmBtn: 'button:has-text("确定"), button:has-text("完成"), button:has-text("确认")',
  coverAutoSelect: '.cover-auto, [class*="auto-cover"], [class*="recommend"]',
  coverScope: '[class*="cover-section"], [class*="cover-area"], [class*="cover-setting"], [class*="cover-wrap"]',

  publishButton: 'button:has-text("发布"), button:has-text("发表")',
  publishButtonPrimary: 'button.publishBtn, [class*="publish-btn"], [class*="submit-btn"]',
  publishScheduledBtn: 'button:has-text("定时发布"), button:has-text("确认发布"), [class*="schedule-submit"]',

  publishSuccessToast: 'text="发布成功"',
  publishFailedToast: 'text="发布失败"',
  publishDraftToast: 'text="已保存草稿"',

  scheduleOption: '[class*="schedule"], [class*="timer"]',
  scheduleToggle: 'button:has-text("定时发布"), [class*="schedule-toggle"], [class*="timer-switch"]',
  scheduleDateInput: 'input[type="date"], [class*="date-picker"] input, input[placeholder*="日期"]',
  scheduleTimeInput: 'input[type="time"], [class*="time-picker"] input, input[placeholder*="时间"]',

  visibilityMoreSettings: 'text="更多设置", button:has-text("更多设置"), [class*="more-setting"]',
  visibilityPrivate: 'text="仅自己可见", text="私密", [class*="private"]',
  visibilityPublic: 'text="公开可见", text="公开", [class*="public"]',
  visibilityFriends: 'text="仅互关好友可见", text="好友可见", [class*="friends"]',

  declarationBtn: 'text="添加内容类型声明", button:has-text("内容类型"), [class*="declaration"], [class*="content-type"]',
  declarationOptionFictional: 'text="虚构演绎，仅供娱乐"',
  declarationOptionAI: 'text="笔记含AI合成内容"',
  declarationOptionAd: 'text="内容包含营销广告"',
} as const;

export const STATS_SELECTORS = {
  totalPlayCount: '[class*="play-count"], [class*="playCount"]',
  totalLikeCount: '[class*="like-count"], [class*="likeCount"]',
  totalCommentCount: '[class*="comment-count"], [class*="commentCount"]',
  totalShareCount: '[class*="share-count"], [class*="shareCount"]',
  totalCollectCount: '[class*="collect-count"], [class*="collectCount"]',
  totalFanCount: '[class*="fan-count"], [class*="fanCount"]',
  statCard: '.stat-card, [class*="data-card"], [class*="stat-item"]',
  dateRangePicker: '.date-range, [class*="date-picker"]',
  dateRangeOptions: '.date-option, [class*="date"] li',
} as const;

export const PUBLISH_URL_PATTERNS = {
  publishPage: '/publish/publish',
  contentManage: '/content/manage',
  dataCenter: '/datacenter/',
} as const;
