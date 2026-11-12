import { consoleThemeScript } from '../../webTheme.js';
import { architectureBody } from './html.js';
import { architectureStyles } from './styles.js';
import { architectureScript } from './script.js';

export function getArchitectureHtml(): string {
  return (
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>项目架构图</title><style>' +
    architectureStyles +
    '</style></head><body>' +
    architectureBody +
    '<script>' +
    consoleThemeScript +
    '\n(async () => {\n' +
    architectureScript +
    '\n})().catch(error => { const status = document.getElementById("load-status"); status.hidden = false;' +
    'status.textContent = "架构图未能加载：" + error.message + "。请返回项目检查页面查看生成指引。"; });</script></body></html>'
  );
}
