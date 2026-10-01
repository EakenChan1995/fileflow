/** 共享常量：主进程与渲染进程都会用到的默认值 */

/** 按后缀归类的默认目录名（key 为不带点的小写后缀） */
export const DEFAULT_EXT_MAP: Record<string, string> = {
  // 图片
  jpg: '图片',
  jpeg: '图片',
  png: '图片',
  gif: '图片',
  webp: '图片',
  bmp: '图片',
  svg: '图片',
  heic: '图片',
  // 文档
  pdf: '文档',
  doc: '文档',
  docx: '文档',
  xls: '表格',
  xlsx: '表格',
  csv: '表格',
  ppt: '演示',
  pptx: '演示',
  txt: '文档',
  md: '文档',
  // 视频音频
  mp4: '视频',
  mov: '视频',
  avi: '视频',
  mkv: '视频',
  flv: '视频',
  mp3: '音频',
  wav: '音频',
  flac: '音频',
  // 压缩包
  zip: '压缩包',
  rar: '压缩包',
  '7z': '压缩包',
  tar: '压缩包',
  gz: '压缩包',
  // 其他
  exe: '程序',
  msi: '程序',
  dmg: '程序',
  iso: '镜像'
}

export const IMAGE_EXT_LIST = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.bmp', '.tiff', '.tif']
