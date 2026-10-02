export function videoCardSize(width: number, videoWidth: number, videoHeight: number) {
  if (
    !Number.isFinite(videoWidth) ||
    !Number.isFinite(videoHeight) ||
    videoWidth <= 0 ||
    videoHeight <= 0
  )
    return;
  const ratio = videoWidth / videoHeight;
  const contentWidth = Math.min(1998, Math.max(46, width - 2));
  const headerHeight = 40;
  const contentHeight = Math.min(1598 - headerHeight, Math.max(34, contentWidth / ratio));
  return {
    width: Math.min(1998, Math.max(46, contentHeight * ratio)) + 2,
    height: contentHeight + headerHeight + 2,
  };
}
