/** Shared recovery guidance for remote media errors; never inspects request inputs. */
export function mediaInputRecoveryHint(message: string): string | undefined {
  if (!message.includes('Maximum call stack size exceeded')) return;
  return (
    '远端返回栈溢出错误，请保留原始错误反馈服务端排查。' +
    '重试前先核对原任务、产物和用量；需要再次提交时，可尝试服务端可访问的 HTTP(S) 素材地址。' +
    '此错误不能直接判断为图片过大，不自动重试。'
  );
}
