/**
 * DC Current App Handlers
 */

import type { ResolvedContext } from '../../core/types/context.js';
import {
  getCurrentAppStoreOverview as getCurrentAppStoreOverviewApi,
  getCurrentAppReviewOverview as getCurrentAppReviewOverviewApi,
  getCurrentAppCommunityOverview as getCurrentAppCommunityOverviewApi,
  getCurrentAppStoreSnapshot as getCurrentAppStoreSnapshotApi,
  getCurrentAppForumContents as getCurrentAppForumContentsApi,
  getCurrentAppReviews as getCurrentAppReviewsApi,
  likeCurrentAppReview as likeCurrentAppReviewApi,
  replyCurrentAppReview as replyCurrentAppReviewApi,
  type JsonObject,
} from './api.js';

/**
 * Resolved current app info for handler output.
 */
interface CurrentAppSelection {
  appId: number;
  appTitle?: string;
}

/**
 * Ensure a current app is selected before using current-app DC capabilities.
 */
function ensureCurrentAppSelected(context: ResolvedContext): CurrentAppSelection | string {
  const resolved = context.resolveApp();

  if (!resolved.appId) {
    return (
      `❌ 当前未选择应用\n\n` +
      `这些 DC 当前游戏能力只服务于已选择的当前游戏。\n\n` +
      `请先按以下步骤操作：\n` +
      `1. 使用 \`list_developers_and_apps\` 查看可用的开发者和应用\n` +
      `2. 使用 \`select_app\` 选择要操作的应用\n` +
      `3. 再次调用当前工具`
    );
  }

  return {
    appId: resolved.appId,
    appTitle: resolved.appTitle,
  };
}

/**
 * Convert response payload into a JSON code block for inspection.
 */
function formatJsonBlock(data: unknown): string {
  return `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
}

function formatRawJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Convert timestamp or string-like values into readable text.
 */
function formatTime(value: unknown): string {
  if (typeof value === 'number') {
    return new Date(value).toLocaleString();
  }

  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }

  return '未知';
}

/**
 * Best-effort extraction of a readable title from generic server objects.
 */
function pickTextField(item: JsonObject | undefined, keys: string[]): string | undefined {
  if (!item) return undefined;

  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }

  return undefined;
}

/**
 * Best-effort extraction of a numeric field from generic server objects.
 */
function pickNumberField(item: JsonObject | undefined, keys: string[]): number | undefined {
  if (!item) return undefined;

  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'number') {
      return value;
    }
  }

  return undefined;
}

function formatOptionalDateRange(startDate?: string, endDate?: string): string {
  if (startDate && endDate) {
    return `${startDate} ~ ${endDate}`;
  }
  if (startDate) return `${startDate} ~ (自动)`;
  if (endDate) return `(自动) ~ ${endDate}`;
  return '默认近 30 天';
}

function formatUnknownNumber(value: number | undefined): string {
  return value === undefined ? '未知' : String(value);
}

function pickRatingReviewCount(summary?: JsonObject): number | undefined {
  const stat = summary?.stat;
  if (typeof stat === 'object' && stat !== null && !Array.isArray(stat)) {
    return pickNumberField(stat as JsonObject, ['review_count', 'count', 'total_count']);
  }
  return pickNumberField(summary, ['review_count', 'count', 'total_count']);
}

function buildRawSelectionPayload(selection: CurrentAppSelection, data: unknown): string {
  return formatRawJson({
    app_id: selection.appId,
    app_title: selection.appTitle,
    data,
  });
}

/**
 * Get current app store overview.
 */
export async function getCurrentAppStoreOverview(
  args: {
    start_date?: string;
    end_date?: string;
  },
  context: ResolvedContext
): Promise<string> {
  const selection = ensureCurrentAppSelected(context);
  if (typeof selection === 'string') return selection;

  try {
    const result = await getCurrentAppStoreOverviewApi(
      {
        app_id: selection.appId,
        start_date: args.start_date,
        end_date: args.end_date,
      },
      context
    );

    let output = `# 当前游戏商店统计概览\n\n`;
    output += `- **应用 ID**: \`${selection.appId}\`\n`;
    output += `- **时间范围**: ${formatOptionalDateRange(result.start_date, result.end_date)}\n`;
    output += `- **曝光量（页面访问量）**: ${formatUnknownNumber(result.page_view_count)}\n`;
    output += `- **下载量**: ${formatUnknownNumber(result.download_count)}\n`;
    output += `- **预约量**: ${formatUnknownNumber(result.reserve_count)}\n`;
    output += `- **广告下载预约量**: ${formatUnknownNumber(result.ad_download_reserve_count)}\n`;
    output += `- **下载请求量**: ${formatUnknownNumber(result.download_request_count)}\n`;
    output += `- **PC 下载请求量**: ${formatUnknownNumber(result.pc_download_request_count)}\n`;
    output += `- **趋势点数**: ${result.trend?.length ?? 0}\n\n`;
    output += `## 原始数据\n\n`;
    output += formatJsonBlock(result);

    return output;
  } catch (error) {
    if (error instanceof Error) {
      return `❌ 获取当前游戏商店统计概览失败：${error.message}`;
    }

    return `❌ 获取当前游戏商店统计概览失败：${String(error)}`;
  }
}

/**
 * Get current app review overview.
 */
export async function getCurrentAppReviewOverview(
  args: {
    start_date?: string;
    end_date?: string;
  },
  context: ResolvedContext
): Promise<string> {
  const selection = ensureCurrentAppSelected(context);
  if (typeof selection === 'string') return selection;

  try {
    const result = await getCurrentAppReviewOverviewApi(
      {
        app_id: selection.appId,
        start_date: args.start_date,
        end_date: args.end_date,
      },
      context
    );

    let output = `# 当前游戏评价统计概览\n\n`;
    output += `- **应用 ID**: \`${selection.appId}\`\n`;
    output += `- **时间范围**: ${formatOptionalDateRange(result.start_date, result.end_date)}\n`;
    output += `- **评分**: ${result.rating_score || '未知'}\n`;
    output += `- **评价总数**: ${formatUnknownNumber(pickRatingReviewCount(result.rating_summary))}\n`;
    output += `- **好评数**: ${formatUnknownNumber(result.positive_review_count)}\n`;
    output += `- **中评数**: ${formatUnknownNumber(result.neutral_review_count)}\n`;
    output += `- **差评数**: ${formatUnknownNumber(result.negative_review_count)}\n`;
    output += `- **趋势点数**: ${result.rating_trend?.length ?? 0}\n\n`;
    output += `## 原始数据\n\n`;
    output += formatJsonBlock(result);

    return output;
  } catch (error) {
    if (error instanceof Error) {
      return `❌ 获取当前游戏评价统计概览失败：${error.message}`;
    }

    return `❌ 获取当前游戏评价统计概览失败：${String(error)}`;
  }
}

/**
 * Get current app community overview.
 */
export async function getCurrentAppCommunityOverview(
  args: {
    start_date?: string;
    end_date?: string;
  },
  context: ResolvedContext
): Promise<string> {
  const selection = ensureCurrentAppSelected(context);
  if (typeof selection === 'string') return selection;

  try {
    const result = await getCurrentAppCommunityOverviewApi(
      {
        app_id: selection.appId,
        start_date: args.start_date,
        end_date: args.end_date,
      },
      context
    );

    const groupName =
      pickTextField(result.group, ['name', 'title']) || selection.appTitle || '当前论坛';

    let output = `# 当前游戏社区统计概览\n\n`;
    output += `- **应用 ID**: \`${selection.appId}\`\n`;
    output += `- **社区**: ${groupName}\n`;
    output += `- **时间范围**: ${formatOptionalDateRange(result.start_date, result.end_date)}\n`;
    output += `- **帖子数**: ${formatUnknownNumber(result.topic_count)}\n`;
    output += `- **关注数**: ${formatUnknownNumber(result.favorite_count)}\n`;
    output += `- **页面浏览量**: ${formatUnknownNumber(result.topic_page_view_count)}\n`;
    output += `- **Feed 数**: ${formatUnknownNumber(result.feed_count)}\n`;
    output += `- **帖子趋势点数**: ${result.topic_trend?.length ?? 0}\n`;
    output += `- **关注趋势点数**: ${result.favorite_trend?.length ?? 0}\n\n`;
    output += `## 原始数据\n\n`;
    output += formatJsonBlock(result);

    return output;
  } catch (error) {
    if (error instanceof Error) {
      return `❌ 获取当前游戏社区统计概览失败：${error.message}`;
    }

    return `❌ 获取当前游戏社区统计概览失败：${String(error)}`;
  }
}

/**
 * Get current app store snapshot.
 */
export async function getCurrentAppStoreSnapshot(context: ResolvedContext): Promise<string> {
  const selection = ensureCurrentAppSelected(context);
  if (typeof selection === 'string') return selection;

  try {
    const result = await getCurrentAppStoreSnapshotApi(selection.appId, context);
    const appName =
      pickTextField(result.app, ['title', 'name', 'app_title', 'display_app_title']) ||
      selection.appTitle ||
      '当前应用';
    const ratingScore = pickNumberField(result.rating_summary, [
      'score',
      'rating',
      'average_score',
    ]);
    const ratingCount = pickNumberField(result.rating_summary, [
      'count',
      'rating_count',
      'total_count',
    ]);

    let output = `# 当前游戏商店结果快照\n\n`;
    output += `- **应用**: ${appName}\n`;
    output += `- **应用 ID**: \`${selection.appId}\`\n`;
    output += `- **版本状态**: ${result.version_status || '未知'}\n`;
    output += `- **预计上线时间**: ${result.expected_launch_time || '未知'}\n`;
    output += `- **详情可见**: ${result.can_view === false ? '否' : '是'}\n`;
    output += `- **最近更新时间**: ${formatTime(result.update_time)}\n`;

    if (ratingScore !== undefined || ratingCount !== undefined) {
      output += `- **评分摘要**: ${ratingScore ?? '未知'} / ${ratingCount ?? '未知'} 条\n`;
    }

    output += `- **近 30 天趋势点数**: ${result.rating_trend?.length ?? 0}\n\n`;
    output += `## 原始数据\n\n`;
    output += formatJsonBlock(result);

    return output;
  } catch (error) {
    if (error instanceof Error) {
      return `❌ 获取当前游戏商店快照失败：${error.message}`;
    }

    return `❌ 获取当前游戏商店快照失败：${String(error)}`;
  }
}

/**
 * Get current app forum contents.
 */
export async function getCurrentAppForumContents(
  args: {
    type?: string;
    sort?: string;
    from?: number;
    limit?: number;
    group_label_id?: number;
  },
  context: ResolvedContext
): Promise<string> {
  const selection = ensureCurrentAppSelected(context);
  if (typeof selection === 'string') return selection;

  try {
    const result = await getCurrentAppForumContentsApi(
      {
        app_id: selection.appId,
        type: args.type,
        sort: args.sort,
        from: args.from,
        limit: args.limit,
        group_label_id: args.group_label_id,
      },
      context
    );

    const groupName =
      pickTextField(result.group, ['name', 'title']) || selection.appTitle || '当前论坛';

    let output = `# 当前游戏论坛内容\n\n`;
    output += `- **应用 ID**: \`${selection.appId}\`\n`;
    output += `- **论坛**: ${groupName}\n`;
    output += `- **排序**: ${args.sort || 'default'}\n`;
    output += `- **类型**: ${args.type || 'feed'}\n`;
    output += `- **本页条数**: ${result.list.length}\n`;
    output += `- **总数**: ${result.total ?? '未知'}\n`;
    output += `- **上一页游标**: ${result.prev_page || '(无)'}\n`;
    output += `- **下一页游标**: ${result.next_page || '(无)'}\n\n`;
    output += `## 原始数据\n\n`;
    output += formatJsonBlock(result);

    return output;
  } catch (error) {
    if (error instanceof Error) {
      return `❌ 获取当前游戏论坛内容失败：${error.message}`;
    }

    return `❌ 获取当前游戏论坛内容失败：${String(error)}`;
  }
}

/**
 * Get current app reviews.
 */
export async function getCurrentAppReviews(
  args: {
    sort?: 'new' | 'hot' | 'spent';
    from?: number;
    limit?: number;
    is_collapsed?: boolean;
    filter_platform?: 'mobile' | 'pc' | 'web';
  },
  context: ResolvedContext
): Promise<string> {
  const selection = ensureCurrentAppSelected(context);
  if (typeof selection === 'string') return selection;

  try {
    const result = await getCurrentAppReviewsApi(
      {
        app_id: selection.appId,
        sort: args.sort,
        from: args.from,
        limit: args.limit,
        is_collapsed: args.is_collapsed,
        filter_platform: args.filter_platform,
      },
      context
    );

    let output = `# 当前游戏评价列表\n\n`;
    output += `- **应用 ID**: \`${selection.appId}\`\n`;
    output += `- **排序**: ${args.sort || 'new'}\n`;
    output += `- **平台筛选**: ${args.filter_platform || '全部'}\n`;
    output += `- **本页条数**: ${result.list.length}\n`;
    output += `- **总数**: ${result.total ?? '未知'}\n`;
    output += `- **上一页游标**: ${result.prev_page || '(无)'}\n`;
    output += `- **下一页游标**: ${result.next_page || '(无)'}\n`;
    output += `- **还有折叠评价**: ${result.has_collapsed_list ? '是' : '否'}\n\n`;
    output += `⚠️ 如需点赞或官方回复，请先把目标评价展示给用户并确认具体的 \`review_id\`。\n\n`;
    output += `## 原始数据\n\n`;
    output += formatJsonBlock(result);

    return output;
  } catch (error) {
    if (error instanceof Error) {
      return `❌ 获取当前游戏评价列表失败：${error.message}`;
    }

    return `❌ 获取当前游戏评价列表失败：${String(error)}`;
  }
}

/**
 * Like a current app review.
 */
export async function likeCurrentAppReview(
  args: { review_id: number },
  context: ResolvedContext
): Promise<string> {
  const selection = ensureCurrentAppSelected(context);
  if (typeof selection === 'string') return selection;

  try {
    const result = await likeCurrentAppReviewApi(
      {
        app_id: selection.appId,
        review_id: args.review_id,
      },
      context
    );

    return (
      `✅ 评价点赞请求已执行\n\n` +
      `- **应用 ID**: \`${result.app_id}\`\n` +
      `- **评价 ID**: \`${result.review_id}\`\n` +
      `- **Moment ID**: \`${result.moment_id ?? '未知'}\`\n` +
      `- **投票方向**: ${result.vote_value || 'up'}\n` +
      `- **执行结果**: ${result.executed ? '成功' : '未执行'}`
    );
  } catch (error) {
    if (error instanceof Error) {
      return `❌ 点赞当前游戏评价失败：${error.message}`;
    }

    return `❌ 点赞当前游戏评价失败：${String(error)}`;
  }
}

/**
 * Reply to a current app review.
 */
export async function replyCurrentAppReview(
  args: {
    review_id: number;
    contents: string;
    reply_comment_id?: number;
    confirm_high_risk?: boolean;
  },
  context: ResolvedContext
): Promise<string> {
  const selection = ensureCurrentAppSelected(context);
  if (typeof selection === 'string') return selection;

  if (!args.contents || args.contents.trim() === '') {
    return (
      `❌ 参数验证失败\n\n` +
      `**contents** 字段是必填的，且不能为空。\n\n` +
      `请提供要发送的官方回复内容。`
    );
  }

  try {
    const result = await replyCurrentAppReviewApi(
      {
        app_id: selection.appId,
        review_id: args.review_id,
        contents: args.contents.trim(),
        reply_comment_id: args.reply_comment_id,
        confirm_high_risk: args.confirm_high_risk,
      },
      context
    );

    const riskReasons = result.risk_reasons?.length
      ? result.risk_reasons.map((item) => `- ${item}`).join('\n')
      : '- (无)';

    let output = `# 官方回复评价结果\n\n`;
    output += `- **应用 ID**: \`${result.app_id}\`\n`;
    output += `- **评价 ID**: \`${result.review_id}\`\n`;
    output += `- **风险等级**: ${result.risk_level}\n`;
    output += `- **是否已发送**: ${result.sent ? '是' : '否'}\n`;
    output += `- **是否需要确认**: ${result.need_confirmation ? '是' : '否'}\n\n`;
    output += `## 风险原因\n${riskReasons}\n\n`;

    if (result.sent) {
      output += `## 已发送评论\n\n`;
      output += formatJsonBlock(result.comment || {});
      return output;
    }

    output += `## 草稿\n\n`;
    output += `${result.draft || args.contents.trim()}\n\n`;

    if (result.need_confirmation) {
      output +=
        `⚠️ 当前回复被判定为 ${result.risk_level} 风险，默认未发送。\n` +
        `如果用户确认仍要发送，请再次调用 \`reply_current_app_review\`，并设置 ` +
        `\`confirm_high_risk=true\`。`;
    } else {
      output += `当前回复未发送，请检查服务端返回信息后重试。`;
    }

    return output;
  } catch (error) {
    if (error instanceof Error) {
      return `❌ 官方回复评价失败：${error.message}`;
    }

    return `❌ 官方回复评价失败：${String(error)}`;
  }
}

/**
 * Get current app store overview as raw JSON.
 */
export async function getCurrentAppStoreOverviewRaw(
  args: {
    start_date?: string;
    end_date?: string;
  },
  context: ResolvedContext
): Promise<string> {
  const selection = ensureCurrentAppSelected(context);
  if (typeof selection === 'string') {
    return formatRawJson({
      ok: false,
      error: 'APP_NOT_SELECTED',
      message: selection,
    });
  }

  const result = await getCurrentAppStoreOverviewApi(
    {
      app_id: selection.appId,
      start_date: args.start_date,
      end_date: args.end_date,
    },
    context
  );

  return buildRawSelectionPayload(selection, result);
}

/**
 * Get current app review overview as raw JSON.
 */
export async function getCurrentAppReviewOverviewRaw(
  args: {
    start_date?: string;
    end_date?: string;
  },
  context: ResolvedContext
): Promise<string> {
  const selection = ensureCurrentAppSelected(context);
  if (typeof selection === 'string') {
    return formatRawJson({
      ok: false,
      error: 'APP_NOT_SELECTED',
      message: selection,
    });
  }

  const result = await getCurrentAppReviewOverviewApi(
    {
      app_id: selection.appId,
      start_date: args.start_date,
      end_date: args.end_date,
    },
    context
  );

  return buildRawSelectionPayload(selection, result);
}

/**
 * Get current app community overview as raw JSON.
 */
export async function getCurrentAppCommunityOverviewRaw(
  args: {
    start_date?: string;
    end_date?: string;
  },
  context: ResolvedContext
): Promise<string> {
  const selection = ensureCurrentAppSelected(context);
  if (typeof selection === 'string') {
    return formatRawJson({
      ok: false,
      error: 'APP_NOT_SELECTED',
      message: selection,
    });
  }

  const result = await getCurrentAppCommunityOverviewApi(
    {
      app_id: selection.appId,
      start_date: args.start_date,
      end_date: args.end_date,
    },
    context
  );

  return buildRawSelectionPayload(selection, result);
}

/**
 * Get current app store snapshot as raw JSON.
 */
export async function getCurrentAppStoreSnapshotRaw(context: ResolvedContext): Promise<string> {
  const selection = ensureCurrentAppSelected(context);
  if (typeof selection === 'string') {
    return formatRawJson({
      ok: false,
      error: 'APP_NOT_SELECTED',
      message: selection,
    });
  }

  const result = await getCurrentAppStoreSnapshotApi(selection.appId, context);
  return buildRawSelectionPayload(selection, result);
}

/**
 * Get current app forum contents as raw JSON.
 */
export async function getCurrentAppForumContentsRaw(
  args: {
    type?: string;
    sort?: string;
    from?: number;
    limit?: number;
    group_label_id?: number;
  },
  context: ResolvedContext
): Promise<string> {
  const selection = ensureCurrentAppSelected(context);
  if (typeof selection === 'string') {
    return formatRawJson({
      ok: false,
      error: 'APP_NOT_SELECTED',
      message: selection,
    });
  }

  const result = await getCurrentAppForumContentsApi(
    {
      app_id: selection.appId,
      type: args.type,
      sort: args.sort,
      from: args.from,
      limit: args.limit,
      group_label_id: args.group_label_id,
    },
    context
  );

  return buildRawSelectionPayload(selection, result);
}

/**
 * Get current app reviews as raw JSON.
 */
export async function getCurrentAppReviewsRaw(
  args: {
    sort?: 'new' | 'hot' | 'spent';
    from?: number;
    limit?: number;
    is_collapsed?: boolean;
    filter_platform?: 'mobile' | 'pc' | 'web';
  },
  context: ResolvedContext
): Promise<string> {
  const selection = ensureCurrentAppSelected(context);
  if (typeof selection === 'string') {
    return formatRawJson({
      ok: false,
      error: 'APP_NOT_SELECTED',
      message: selection,
    });
  }

  const result = await getCurrentAppReviewsApi(
    {
      app_id: selection.appId,
      sort: args.sort,
      from: args.from,
      limit: args.limit,
      is_collapsed: args.is_collapsed,
      filter_platform: args.filter_platform,
    },
    context
  );

  return buildRawSelectionPayload(selection, result);
}

/**
 * Like a current app review as raw JSON.
 */
export async function likeCurrentAppReviewRaw(
  args: { review_id: number },
  context: ResolvedContext
): Promise<string> {
  const selection = ensureCurrentAppSelected(context);
  if (typeof selection === 'string') {
    return formatRawJson({
      ok: false,
      error: 'APP_NOT_SELECTED',
      message: selection,
    });
  }

  const result = await likeCurrentAppReviewApi(
    {
      app_id: selection.appId,
      review_id: args.review_id,
    },
    context
  );

  return buildRawSelectionPayload(selection, result);
}

/**
 * Reply to a current app review as raw JSON.
 */
export async function replyCurrentAppReviewRaw(
  args: {
    review_id: number;
    contents: string;
    reply_comment_id?: number;
    confirm_high_risk?: boolean;
  },
  context: ResolvedContext
): Promise<string> {
  const selection = ensureCurrentAppSelected(context);
  if (typeof selection === 'string') {
    return formatRawJson({
      ok: false,
      error: 'APP_NOT_SELECTED',
      message: selection,
    });
  }

  const result = await replyCurrentAppReviewApi(
    {
      app_id: selection.appId,
      review_id: args.review_id,
      contents: args.contents.trim(),
      reply_comment_id: args.reply_comment_id,
      confirm_high_risk: args.confirm_high_risk,
    },
    context
  );

  return buildRawSelectionPayload(selection, result);
}
