import type { DeveloperCraftList } from '../app/api.js';
import type { UploadParams } from './api.js';

// Type alias for backward compatibility with original variable names
type TapDeveloperInfo = DeveloperCraftList;

/**
 * H5 游戏类型列表
 */
export const GENRE_LIST = {
  rpg: '角色扮演',
  casual: '休闲',
  action: '动作',
  strategy: '策略',
  simulation: '模拟',
  trivia: '益智',
  arcade: '街机',
  adventure: '冒险',
  card: '卡牌',
  sports: '体育',
  racing: '竞速',
  puzzle: '知识问答',
  educational: '教育',
  music: '音乐',
  word: '文字',
  board: '桌面和棋类',
};

/**
 * 工具描述常量
 */
export const TOOL_DESCRIPTION = {
  GENRE_DESCRIPTION: `If user provides a specific game genre, use it directly.
                 If user is unsure or doesn't specify, analyze the code files, game mechanics, UI elements, and gameplay features in the project directory to determine the most appropriate game genre.
                 Available genres keys: ${Object.keys(GENRE_LIST).join(', ')}, and the chinese name of the genre is ${Object.values(GENRE_LIST).join(', ')}.
                 When analyzing, consider game rules, player interactions, visual elements, and core gameplay loops.
                 If still uncertain after analysis, default to 'casual' as fallback.`,
};

/**
 * 中文消息常量定义
 */
export const MESSAGES = {
  // 通用消息
  MANUAL_CONFIRMATION_REQUIRED: '禁止帮助用户自动选择和自动确认，请用户手动确认',
  ABSOLUTE_PATH_REQUIRED: '请输入绝对路径',
  LOGOUT_SUCCESS: '已成功退出当前账号',
  LOGOUT_NOT_LOGIN: '当前未登录',

  // 游戏状态相关
  REVIEW_STATUS: {
    NOT_PUBLISHED: '未发布',
    UNDER_REVIEW: '审核中',
    REVIEW_FAILED: '审核失败',
    PUBLISHED: '已上线',
  },

  // 游戏信息确认相关
  CONFIRM_GAME_INFO: (
    path: string,
    developerName?: string,
    developerId?: number,
    appId?: number,
    appName?: string
  ) => {
    let msg = `请用户检查以下信息是否正确:\n        1. 游戏路径：${path} \n`;
    if (developerName) {
      msg += `2. 开发者身份：${developerName} \n`;
    }
    if (developerId) {
      msg += `2.1. 开发者身份 ID: (${developerId}) ${
        developerName ? '无须给用户展示开发者身份的 ID, 请直接展示开发者身份的名称' : ''
      }\n`;
    }
    if (appId) {
      msg += `3. 游戏：${appName ?? ''} (ID: ${appId}) \n`;
    }
    msg += `如果用户确认以上信息没有问题，则请调用 h5_game_uploader 工具上传游戏`;
    return msg;
  },

  GAME_PATH_ERROR: (path: string) =>
    `游戏路径 '${path}' 存在异常或缺少 index.html 文件，请重试查找游戏路径或者告知用户手动输入游戏目录，根路径需要包含 index.html 文件`,

  REVIEW_STATUS_TEXT: (reviewStatus: number) =>
    `审核状态：${
      reviewStatus === 0
        ? '未发布'
        : reviewStatus === 1
          ? '审核中'
          : reviewStatus === 2
            ? '审核失败'
            : '已上线'
    }`,

  // 开发者身份和游戏选择相关
  SELECT_DEVELOPER_OR_GAME: (results: TapDeveloperInfo[]) => {
    let msg = '';
    let appCount = 0;
    for (const item of results) {
      if (item.levels) {
        appCount += item.levels.length;
      }
      msg += `● 开发者身份：${item.developer_name}(ID: ${item.developer_id})\n`;
      for (const app of item.levels) {
        msg += `  ○ 游戏名称：${app.app_title}(ID: ${app.app_id})\n`;
      }
    }

    const prefix =
      appCount > 0 ? '请用户输入需要使用的游戏 ID: \n' : '请用户输入需要使用的开发者身份：\n';
    msg = prefix + msg;
    msg += `无须给用户展示开发者身份的 ID, 请直接展示开发者身份的名称\n`;
    msg += `如果用户输入了一个游戏或者开发者身份，则请再次调用 h5_game_info_gatherer 工具收集游戏信息\n`;
    return msg;
  },

  SELECT_DEVELOPER_FOR_CREATE: (results: TapDeveloperInfo[]) => {
    let msg = '请用户输入需要使用的开发者身份：\n';
    msg += MESSAGES.ALL_DEVELOPER_INFO(results);
    msg += `无须给用户展示开发者身份的 ID, 请直接展示开发者身份的名称\n`;
    msg += `如果用户输入了一个开发者身份，则请再次调用 h5_create_app 工具继续创建游戏\n`;
    return msg;
  },

  ALL_DEVELOPER_INFO: (results: TapDeveloperInfo[]) => {
    let msg = '';
    for (const item of results) {
      msg += `● 开发者身份：${item.developer_name}(ID: ${item.developer_id})\n`;
      for (const app of item.levels) {
        msg += `  ○ 游戏名称：${app.app_title}(ID: ${app.app_id})\n`;
      }
    }
    return msg;
  },

  // 游戏创建和发布相关
  GAME_TYPE_INFO: (displayAppTitle?: string) =>
    `由于您当前的游戏使用了快速上架流程，上线后将会以【${displayAppTitle ?? ''}】的关卡形式进行分发`,
  CREATE_DEVELOPER_SUCCESS: (developerName: string, developerId: number) =>
    `创建开发者身份成功，开发者身份：${developerName}(ID: ${developerId})`,
  CREATE_DEVELOPER_FAILED: '创建开发者身份失败，请创建开发者身份后重试',
  DEVELOPER_ID_NOT_EXISTS: '开发者身份 ID 不存在，请先创建开发者身份',
  DIRECTORY_NOT_EXISTS: (path: string) => `目录不存在：${path}`,
  CREATE_GAME_PROGRESS: (devid: number, appId?: number) =>
    `创建游戏，开发者身份 ID: ${devid}, 游戏 ID: ${appId}`,

  CREATE_GAME_SUCCESS: (
    devid: number,
    appId: number,
    appTitle?: string,
    displayAppTitle?: string
  ) =>
    `创建游戏成功，开发者身份 ID: ${devid}, 游戏 ID: ${appId}, 游戏名称：${appTitle},
        由于您当前的游戏快速上架流程，上线后将会以【${displayAppTitle ?? ''}】的关卡形式进行分发
        请 AI 继续调用 h5_game_info_gatherer 工具收集游戏信息`,

  CREATE_GAME_FAILED: '创建游戏失败，请重试',

  GAME_PUBLISH_SUCCESS: (appName?: string, appId?: number) =>
    `游戏${appName ?? ''}(${appId}) 发布成功，用户可以打开 TapTap 应用，在个人页查看游戏，应用处于审核中状态，审核通过后，所有用户都可以体验`,

  EDIT_GAME_INFO_SUCCESS: `修改游戏信息成功`,
  EDIT_GAME_INFO_FAILED: '修改游戏信息失败，请重试',
  EDIT_GAME_INFO_CONFIRMATION: '请提供开发者身份 ID 和游戏 ID',

  // 压缩和上传相关
  COMPRESSION_SUCCESS: (size: number) => `压缩成功，压缩文件大小：${size} 字节`,
  GET_UPLOAD_PARAMS_SUCCESS: (uploadParams: UploadParams, outputPath: string) =>
    `获取上传参数成功，上传参数：${JSON.stringify(uploadParams)} outputPath: ${outputPath}`,
  UPLOAD_PACKAGE_SUCCESS: '上传包成功',
  PACKAGE_RESPONSE: (jsonResponse: unknown) => `包 response: ${JSON.stringify(jsonResponse)}`,
  UPLOAD_PACKAGE_GET_ID_FAILED: (reason: string) => `获取包 ID 失败，请重试 ${reason}`,
  PUBLISH_PARAMS: (appId: number, developerId: number, packageId: number) =>
    `发布参数，游戏 ID: ${appId}, 开发者身份 ID: ${developerId}, 包 ID: ${packageId}`,

  // 错误消息
  COMPRESSION_FAILED: (error: string) => `创建压缩文件失败：${error}`,
  CREATE_FILE_STREAM_ERROR: (error: string) => `创建文件流错误：${error}`,
  COMPRESSION_PROCESS_ERROR: (error: string) => `压缩过程错误：${error}`,
  UPLOAD_FAILED: (status: number) => `上传失败：${status}, 请重试`,
  FILE_COMPRESSED_UPLOAD_FAILED: (error: string) => `文件压缩，但上传失败：${error}, 请重试`,
  COMPRESSED_GET_PARAMS_FAILED: (size: number, error: string) =>
    `压缩文件，但获取上传参数失败：${size} 字节 ${error}, 请重试`,

  // 保存用户信息
  SAVE_USER_INFO_SUCCESS: (config: unknown) => `保存用户信息成功：${JSON.stringify(config)}`,

  // 警告消息
  ARCHIVE_WARNING: (err: unknown) => `警告：${err}`,
};
