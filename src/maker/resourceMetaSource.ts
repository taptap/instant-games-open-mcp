/** Protocol adapter only. Meta contents and UUIDs are produced by the bundled UrhoX code. */
export const RESOURCE_META_RUNNER = String.raw`
import contextlib
import io
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, sys.argv[1])
from meta_generator import MetaGenerator, search_project_config, load_project_json

def main():
    request = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))
    root = Path(request['project']).resolve(strict=True)
    def safe(p):
        relative = p.relative_to(root)
        current = root
        for part in relative.parts:
            current = current / part
            if current.is_symlink():
                raise ValueError('不允许符号链接: ' + str(relative))
        if p.exists() and not (p.is_file() or p.is_dir()):
            raise ValueError('不允许特殊文件: ' + str(relative))
        return p

    config = search_project_config(root)
    if config is None:
        raise ValueError('缺少 UrhoX project.json；请先完善项目配置。')
    safe(config)
    # The bundled JSONC helper strips // inside URL strings. Read standard JSON
    # first, retaining the official fallback and identity-field precedence.
    try:
        data = json.loads(config.read_text(encoding='utf-8-sig'))
    except ValueError:
        author, game = load_project_json(config)
    else:
        author = data.get('author', {}).get('id')
        game = data.get('id') or data.get('project_id')
    if not all(isinstance(v, str) and v.strip() for v in (author, game)):
        raise ValueError('项目配置必须包含有效的 author.id 和 id 或 project_id。')
    generator = MetaGenerator(author, game)
    targets = []
    for relative in request['paths']:
        parts = relative.split('/')
        if any(not p or p in ('.', '..') or p.startswith('.') or p in generator.DEFAULT_IGNORE_DIRS for p in parts) or '\\' in relative or ':' in relative:
            raise ValueError('资源路径必须是项目内的相对路径，不能指向隐藏或构建目录: ' + relative)
        target = safe(root / relative)
        if not target.exists():
            raise ValueError('资源不存在: ' + relative)
        targets.append(target)

    files = {}
    skipped = {}
    class Collector(MetaGenerator):
        def process_directory(self, directory, recursive=True):
            safe(Path(directory))
            return super().process_directory(directory, recursive)
        def process_file(self, filename):
            filename = safe(Path(filename))
            relative = filename.relative_to(root).as_posix()
            if self._should_skip(filename):
                skipped[relative] = {'path': relative, 'status': 'skipped'}
            else:
                files[relative] = filename
            if len(files) + len(skipped) > 5000:
                raise ValueError('单次最多处理 5000 个文件，请缩小目录范围。')
            return True, ''
    collector = Collector(author, game)
    for target in targets:
        collector.process_path(target)
    if len(files) > 5000:
        raise ValueError('单次最多处理 5000 个资源，请缩小目录范围。')

    # The official generator can also create a same-stem XML/JSON sidecar.
    # Preflight and report those files too, without changing its creation order.
    affected = dict(files)
    for filename in files.values():
        if not safe(Path(str(filename) + '.meta')).exists() and filename.suffix.lower() not in ('.xml', '.json'):
            for ext in ('.xml', '.json'):
                companion = safe(filename.with_suffix(ext))
                if companion.exists():
                    if not companion.is_file():
                        raise ValueError('同名配置不是文件: ' + str(companion))
                    affected[companion.relative_to(root).as_posix()] = companion
                    break

    def read_meta(filename):
        meta = safe(Path(str(filename) + '.meta'))
        value = json.loads(meta.read_text(encoding='utf-8'))
        if not isinstance(value, dict) or not isinstance(value.get('uuid'), str) or not re.fullmatch(r'[A-Za-z0-9_-]{24}', value['uuid']):
            raise ValueError('无效的 .meta 或 UUID，保留原文件，请先修复: ' + str(meta))
        return value['uuid']

    before = {}
    known = {}
    for relative, filename in affected.items():
        meta = safe(Path(str(filename) + '.meta'))
        if meta.exists():
            uuid = read_meta(filename)
            if uuid in known:
                raise ValueError('请求范围内存在重复 UUID: ' + known[uuid] + ' / ' + relative)
            known[uuid] = relative
            before[relative] = meta.read_bytes()
    # Share one official UUIDGenerator across the whole request, including companions.
    for filename in files.values():
        success, message = generator.process_file(filename)
        if not success:
            raise ValueError(message)

    rows = []
    known = {}
    for relative, filename in affected.items():
        uuid = read_meta(filename)
        if uuid in known:
            raise ValueError('请求范围内存在重复 UUID: ' + known[uuid] + ' / ' + relative)
        known[uuid] = relative
        if relative in before and Path(str(filename) + '.meta').read_bytes() != before[relative]:
            raise ValueError('已有 .meta 在执行期间被修改: ' + relative)
        rows.append({'path': relative, 'metaPath': relative + '.meta', 'uuid': uuid,
                     'status': 'preserved' if relative in before else 'generated'})
    rows.extend(skipped.values())
    return {'success': True, 'projectPath': str(root), 'results': rows}

try:
    with contextlib.redirect_stdout(io.StringIO()):
        result = main()
except Exception as error:
    result = {'success': False, 'error': str(error),
              'next_action': '修复错误后可重新调用；已有 meta 不会重建。若执行中断，部分文件可能已生成，请先检查，勿重新生成付费素材。'}
print(json.dumps(result, ensure_ascii=False))
`;
