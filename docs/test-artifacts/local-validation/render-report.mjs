import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const reportPath = path.resolve(root, '../..', 'local-validation-phase-one-report.html');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const read = file => fs.readFileSync(file, 'utf8');
const details = (title, text, open = false) =>
  `<details${open ? ' open' : ''}><summary>${escape(title)}</summary><pre>${escape(text)}</pre></details>`;
const image = file => `<figure><img width="469" height="834" alt="${escape(path.basename(file))}" src="data:image/png;base64,${fs.readFileSync(file).toString('base64')}"><figcaption>${escape(path.basename(file))} · ${fs.statSync(file).size.toLocaleString()} bytes</figcaption></figure>`;
const labels = {
  '01-agent-failure': '01 · Agent 首轮验证：检出 Lua 故障',
  '02-agent-fixed': '02 · Agent 修复后：同模式复测',
  '03-agent-screenshot': '03 · 独立截图模式',
  '04-agent-validate': '04 · 独立 validate 模式',
  '05-final-both': '05 · 最终源码组合验证',
};
const acceptance = path.join(root, 'acceptance');
let sections = '';
for (const folder of fs.readdirSync(acceptance).sort()) {
  const dir = path.join(acceptance, folder);
  if (!fs.existsSync(path.join(dir, 'response.json'))) continue;
  const result = JSON.parse(read(path.join(dir, 'response.json')));
  const command = JSON.parse(read(path.join(dir, 'command.json')));
  const files = fs.readdirSync(dir).sort();
  sections += `<section><h2>${escape(labels[folder] || folder)}</h2><p class="${result.ok ? 'pass' : 'warn'}">CLI ${escape(result.result)} · 退出码 ${command.exit_code} · ${escape(command.started)}</p>`;
  sections += `<p>模式 ${escape(result.mode)}；${result.report ? `实际运行 ${result.report.frames_completed} 帧；Lua 错误 ${result.report.summary.lua_errors}、资源错误 ${result.report.summary.resource_errors}、引擎错误 ${result.report.summary.engine_errors}。` : '该模式不生成 validate 报告。'}</p>`;
  if (result.error) sections += `<p class="warn">${escape(result.error)}</p>`;
  if (folder === '01-agent-failure') sections += '<p>隔离游戏的 Start() 被注入 error("LOCAL_VALIDATION_ACCEPTANCE_INJECTED_FAILURE")；引擎正确报告 Lua 错误，游戏启动未成功，因此没有截图，不伪造失败画面。</p>';
  if (folder === '02-agent-fixed') sections += '<p>Agent 阅读已安装 Skill、报告和日志后，仅移除隔离副本中的故障行，再运行相同命令；截图显示游戏关卡菜单，未停留在加载页。</p>';
  sections += details('实际 CLI 命令、时间、退出状态', JSON.stringify(command, null, 2));
  for (const f of files.filter(f => f.endsWith('.png'))) sections += image(path.join(dir, f));
  for (const f of files.filter(f => /\.(json|log|txt)$/.test(f) && f !== 'command.json'))
    sections += details(`${f} · 完整原始内容`, read(path.join(dir, f)));
  sections += '</section>';
}
let checks = '';
const checksDir = path.join(root, 'checks');
if (fs.existsSync(checksDir)) {
  for (const f of fs.readdirSync(checksDir).sort())
    if (/\.(json|jsonl|log|txt|md)$/.test(f)) checks += details(f, read(path.join(checksDir, f)));
}
let history = '';
for (const folder of ['01-initial-fail', '02-validate-pass', '03-screenshot-pass', '04-both-pass']) {
  const dir = path.join(root, folder);
  if (!fs.existsSync(dir)) continue;
  let content = '';
  for (const f of fs.readdirSync(dir).sort())
    content += f.endsWith('.png') ? image(path.join(dir, f)) : details(f, read(path.join(dir, f)));
  history += `<details><summary>${escape(folder)} · 早期测试留存</summary>${content}</details>`;
}
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Maker 本地验证验收记录</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#20252b;font:15px/1.65 system-ui,-apple-system,sans-serif;letter-spacing:0}
main{max-width:1040px;margin:auto;padding:28px 22px 70px}h1{font-size:28px;line-height:1.3;margin:0 0 10px}h2{font-size:20px;margin:0 0 10px}
section{border-top:1px solid #cbd5e1;padding:24px 0}p{margin:8px 0}.muted{color:#586779}.pass{color:#09694b;font-weight:650}.warn{color:#943c13;font-weight:650}
.notice{border-left:4px solid #147d92;padding:10px 16px;background:#e9f4f6;margin:20px 0}details{margin:10px 0}summary{cursor:pointer;overflow-wrap:anywhere;color:#155a8c;padding:6px 0}
pre{font:12px/1.6 ui-monospace,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#fff;border:1px solid #d5dee4;padding:14px;max-height:550px;overflow:auto}
figure{margin:18px 0}img{display:block;max-width:100%;height:auto;border:1px solid #cbd5e1}figcaption{font-size:12px;color:#586779;overflow-wrap:anywhere}
code{font-size:13px;overflow-wrap:anywhere}ul{padding-left:22px}.pill{display:inline-block;color:#09694b;font-weight:650}
@media(max-width:600px){main{padding:20px 14px}h1{font-size:24px}}
</style></head><body><main>
<h1>Maker 本地验证验收记录</h1><p class="muted">macOS · 阶段一 · 生成时间 ${escape(new Date().toISOString())} · 本地开发版本，未发布</p>
<div class="notice"><strong>本机开发结论：</strong>阶段一代码与显式 Skill 执行闭环已跑通；新会话自动发现测试受额度阻塞，正式渠道未发布。<br>
本地 Skill 安装 → Agent 调用 MCP 所属 CLI → 真实 Runtime → 日志 / JSON / PNG → Agent 查错修复 → 再次验证；下方保留失败与成功证据，不以单张截图代替玩法验收。</div>
<p class="pass">MCP 相关回归 343 / 343；Skill 分发测试 3 / 3；引擎截图契约测试 5 / 5；macOS arm64 + x86_64 Runtime 编译成功。</p>
<section><h2>改了什么</h2><p><strong>MCP：</strong>新增三模式一次性验证，补齐项目互斥、报告与 PNG 检查、取消清理和逐轮证据，属于局部改动。</p>
<p><strong>UrhoX：</strong>修复 Metal 截图准备的渲染线程调用和写盘诊断，增加可选的游戏启动后计帧参数，保留 Web 默认语义。</p>
<p><strong>Skill：</strong>只解除 macOS 的 run-lua-validate 排除项，本地走当前渠道 CLI，Web / 直接 Runtime 原有流程保留。</p>
<p><strong>分支：</strong>两个仓库均为 fix/local-validation-phase-one；urhox_dev 中另有两处 CMake 本地编译兼容调整，deploy/orchestrator 原有变更不属于本任务。</p></section>
<section><h2>必须区分的结论</h2><ul>
<li>真实 Agent 已按安装后的 Skill 完成故障定位、代码修复、重跑和看图；这是显式读取 Skill 的执行验收，不是所有 AI 客户端自动发现行为的验收。</li>
<li>另行启动全新 Codex CLI 会话检查自动发现时，被工作区消费额度上限拦截（spend cap）；该项未通过也未判为代码缺陷，原始错误保存在下方记录。</li>
<li>新图像显示“5秒夺宝”菜单和四个关卡按钮；未测试鼠标点击、完整关卡、声音播放、存档和多人行为。</li>
<li>报告 PASS 不代表原始日志零错误：启动日志存在 Cube/Day/DaySpecularHDR_QualityLow.dds 缺失，headless 还有跳过 shader 编译的错误信息，均保留原文。</li>
<li>Runtime 将请求窗口按桌面可用尺寸缩放：传入 1080×1920，实测 PNG 469×834；报告使用文件实际像素，不把请求值当作实际值。</li>
<li>当前验证使用显式指定的本地编译 Runtime；正式交付仍需发布匹配的 MCP、Runtime 和 ai-dev-kit，并在产品电脑验收；没有擅自发布。</li>
<li>Windows 未实机验收，仍在 Skill 排除名单；多人 / server 项目明确拒绝一次性验证。</li>
</ul></section>
${sections}
<section><h2>安装、构建、回归与审查记录</h2><p>以下为实际执行输出；类型检查分别记录 HEAD 基线和当前新增错误，避免将打包成功误称全仓类型检查通过。</p>${checks}</section>
<section><h2>早期测试证据</h2><p>保留前一轮字体缺失、补齐字体和截图实验的文件；不将旧结果冒充当前源码的最终验收。</p>${history}</section>
</main></body></html>`;
fs.writeFileSync(reportPath, html);
console.log(JSON.stringify({ report: reportPath, bytes: Buffer.byteLength(html), imageCount: (html.match(/<img /g) || []).length }));
