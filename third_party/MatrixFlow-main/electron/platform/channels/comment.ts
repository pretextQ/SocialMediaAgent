import type { Page } from 'patchright';
import { Logger } from '../../core/Logger';
import { AuthError } from '../base/PlatformError';
import type { CommentContext, CommentResult } from '../base/types';

const logger = new Logger('ChannelsComment');

/**
 * 视频号评论功能
 *
 * ⚠️ 重要说明：
 * 视频号不支持自动评论功能，这是微信平台的限制。
 * 所有评论相关函数会直接抛出 AuthError，保持接口兼容性但运行时拦截。
 *
 * 如需支持视频号评论，需要：
 * 1. 等待微信开放平台提供相关 API
 * 2. 或改用人工介入方式
 */

const UNSUPPORTED_MESSAGE = '视频号不支持自动评论功能';

/**
 * 发布评论
 * @throws AuthError 视频号不支持自动评论
 */
export async function postComment(
  _page: Page,
  _videoId: string,
  _comment: string
): Promise<CommentResult> {
  // 视频号不支持自动评论功能，运行时抛错但保持接口兼容
  logger.warn(UNSUPPORTED_MESSAGE);
  throw new AuthError(UNSUPPORTED_MESSAGE, undefined, 'channels');
}

/**
 * 获取评论列表
 * @throws AuthError 视频号不支持自动评论
 */
export async function fetchComments(
  _page: Page,
  _videoId: string,
  _maxCount?: number
): Promise<Array<{ id: string; content: string; author: string }>> {
  logger.warn(UNSUPPORTED_MESSAGE);
  throw new AuthError(UNSUPPORTED_MESSAGE, undefined, 'channels');
}

/**
 * 回复评论
 * @throws AuthError 视频号不支持自动评论
 */
export async function replyComment(
  _page: Page,
  _videoId: string,
  _commentId: string,
  _content: string
): Promise<CommentResult> {
  logger.warn(UNSUPPORTED_MESSAGE);
  throw new AuthError(UNSUPPORTED_MESSAGE, undefined, 'channels');
}

/**
 * 删除评论
 * @throws AuthError 视频号不支持自动评论
 */
export async function deleteComment(
  _page: Page,
  _videoId: string,
  _commentId: string
): Promise<CommentResult> {
  logger.warn(UNSUPPORTED_MESSAGE);
  throw new AuthError(UNSUPPORTED_MESSAGE, undefined, 'channels');
}

/**
 * 带重试的评论发布
 * @throws AuthError 视频号不支持自动评论
 */
export async function postCommentWithRetry(
  _page: Page,
  _context: CommentContext,
  _maxRetries?: number
): Promise<CommentResult> {
  logger.warn(UNSUPPORTED_MESSAGE);
  throw new AuthError(UNSUPPORTED_MESSAGE, undefined, 'channels');
}

/**
 * 完整评论流程（浏览器启动 → 评论）
 * @throws AuthError 视频号不支持自动评论
 */
export async function postCommentFull(
  _accountId: string,
  _videoId: string,
  _comment: string
): Promise<CommentResult> {
  logger.warn(UNSUPPORTED_MESSAGE);
  throw new AuthError(UNSUPPORTED_MESSAGE, undefined, 'channels');
}
