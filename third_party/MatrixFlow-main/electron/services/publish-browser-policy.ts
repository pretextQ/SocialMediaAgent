const CHANNELS_INTERACTIVE_FAILURES = [
  '视频号描述或短标题填写失败',
  '视频号位置设置失败',
  '视频号定时发表设置失败',
  '视频号原创声明未完成',
];

export function shouldPreserveStandaloneBrowserAfterFailure(
  platform: string,
  failureMessage: string,
): boolean {
  if (platform !== 'channels') return false;
  return CHANNELS_INTERACTIVE_FAILURES.some((message) => failureMessage.includes(message));
}
