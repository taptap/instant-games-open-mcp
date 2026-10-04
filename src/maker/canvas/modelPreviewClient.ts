import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { readCanvasModelMesh } from './modelMesh.js';

const status = document.getElementById('status')!;
const host = document.getElementById('viewport')!;
const thumbnail = new URLSearchParams(location.search).get('mode') === 'thumbnail';
if (thumbnail) document.body.classList.add('thumbnail');
function publishThumbnail(result: { image?: string; error?: string }) {
  if (thumbnail && window.parent !== window)
    window.parent.postMessage({ type: 'maker:model-thumbnail', ...result }, location.origin);
}
const abort = new AbortController();
const timer = setTimeout(() => abort.abort(), 60000);
const owned: Array<{ dispose(): void }> = [];
const bitmaps: ImageBitmap[] = [];
let renderer: THREE.WebGLRenderer | undefined;
let controls: OrbitControls | undefined;
let resize: ResizeObserver | undefined;
let disposed = false;
function dispose() {
  if (disposed) return;
  disposed = true;
  abort.abort();
  clearTimeout(timer);
  resize?.disconnect();
  controls?.dispose();
  owned.forEach((resource) => resource.dispose());
  bitmaps.forEach((bitmap) => bitmap.close());
  renderer?.dispose();
  renderer?.forceContextLoss();
}
window.addEventListener('pagehide', dispose, { once: true });
async function main() {
  const parameters = new URLSearchParams(location.search);
  const project = parameters.get('project') || '';
  const canvas = parameters.get('canvas') || '';
  const node = parameters.get('node') || '';
  if (
    !/^[a-f0-9]{64}$/.test(project) ||
    !/^[a-f0-9-]{36}$/i.test(canvas) ||
    !/^[a-f0-9-]{36}$/i.test(node)
  )
    throw new Error('模型预览参数无效。');
  const endpoint =
    '/api/projects/' + project + '/canvases/' + canvas + '/models/preview?nodeId=' + node;
  async function request(url: string) {
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) throw new Error((await response.json()).error || '模型文件读取失败。');
    return response;
  }
  const manifest = (await (await request(endpoint)).json()) as {
    attemptId: string;
    model: string;
    files: Array<{ path: string; size: number }>;
  };
  const allowed = new Set(manifest.files.map((file) => file.path));
  if (parameters.has('attemptId') && parameters.get('attemptId') !== manifest.attemptId)
    throw new Error('模型结果已变化，请刷新本地状态。');
  const fileUrl = (file: string) => {
    if (!allowed.has(file)) throw new Error('模型引用的文件未包含在交付包中：' + file);
    return (
      endpoint +
      '&attemptId=' +
      encodeURIComponent(manifest.attemptId) +
      '&file=' +
      encodeURIComponent(file)
    );
  };
  const texts = new Map<string, string>();
  const identities = new Map<string, string>();
  for (const file of manifest.files.filter((item) => /\.(meta|prefab|xml)$/i.test(item.path))) {
    const value = await (await request(fileUrl(file.path))).text();
    if (file.path.endsWith('.meta')) {
      const metadata = JSON.parse(value);
      if (typeof metadata.uuid === 'string')
        identities.set('uuid://' + metadata.uuid, file.path.slice(0, -5));
    } else texts.set(file.path, value);
  }
  const xml = (file: string) => {
    const source = texts.get(file);
    if (!source) throw new Error('模型缺少描述文件：' + file);
    const result = new DOMParser().parseFromString(source, 'application/xml');
    if (result.querySelector('parsererror')) throw new Error('模型描述文件无效：' + file);
    return result;
  };
  const reference = (value: string) => {
    const result = identities.get(value) || value;
    if (!allowed.has(result)) throw new Error('模型依赖未找到：' + value);
    return result;
  };
  const materialRefs: string[][] = [];
  for (const file of manifest.files.filter((item) => item.path.endsWith('.prefab'))) {
    for (const component of Array.from(xml(file.path).querySelectorAll('component'))) {
      const model = component.querySelector('attribute[name="Model"]')?.getAttribute('value');
      if (!model || reference(model.split(';').slice(1).join(';')) !== manifest.model) continue;
      const material = component.querySelector('attribute[name="Material"]')?.getAttribute('value');
      if (material) materialRefs.push(material.split(';').slice(1).map(reference));
    }
  }
  if (materialRefs.length !== 1) throw new Error('模型材质关联不明确，请导出后在 Maker 中查看。');
  const meshes = readCanvasModelMesh(await (await request(fileUrl(manifest.model))).arrayBuffer());
  if (disposed) return;
  if (materialRefs[0].length !== meshes.length) throw new Error('模型几何体与材质数量不匹配。');
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x182022);
  host.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '可旋转的真实模型预览');
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root, new THREE.HemisphereLight(0xffffff, 0x8899aa, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(3, 5, 4);
  scene.add(light);
  let triangles = 0;
  for (let index = 0; index < meshes.length; index++) {
    const mesh = meshes[index];
    const materialXml = xml(materialRefs[0][index]);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    owned.push(material);
    const color = materialXml
      .querySelector('parameter[name="MatDiffColor"]')
      ?.getAttribute('value')
      ?.trim()
      .split(/\s+/)
      .map(Number);
    if (color && color.length === 4 && color.every(Number.isFinite)) {
      material.color.setRGB(color[0], color[1], color[2]);
      material.opacity = THREE.MathUtils.clamp(color[3], 0, 1);
      material.transparent = material.opacity < 1;
    }
    const diffuse = materialXml
      .querySelector('texture[unit="diffuse"], texture[unit="0"]')
      ?.getAttribute('name');
    if (diffuse) {
      const texturePath = reference(diffuse);
      if (!/\.(png|jpg|jpeg|webp)$/i.test(texturePath))
        throw new Error('模型贴图格式暂不支持预览。');
      const bitmap = await createImageBitmap(await (await request(fileUrl(texturePath))).blob());
      if (disposed) {
        bitmap.close();
        return;
      }
      bitmaps.push(bitmap);
      if (bitmap.width > 8192 || bitmap.height > 8192) throw new Error('模型贴图尺寸过大。');
      const texture = new THREE.Texture(bitmap);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      texture.needsUpdate = true;
      owned.push(texture);
      material.map = texture;
    }
    const geometry = new THREE.BufferGeometry();
    owned.push(geometry);
    geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    if (mesh.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
    if (mesh.uv) geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uv, 2));
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    if (!mesh.normals) geometry.computeVertexNormals();
    root.add(new THREE.Mesh(geometry, material));
    triangles += mesh.indices.length / 3;
  }
  const bounds = new THREE.Box3().setFromObject(root);
  const radius = bounds.getSize(new THREE.Vector3()).length() / 2;
  if (!Number.isFinite(radius) || radius <= 0) throw new Error('模型尺寸无效。');
  root.position.sub(bounds.getCenter(new THREE.Vector3()));
  const camera = new THREE.PerspectiveCamera(40, 1, radius / 100, radius * 100);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.minDistance = radius * 0.4;
  controls.maxDistance = radius * 12;
  const render = () => {
    if (!disposed && renderer) renderer.render(scene, camera);
  };
  controls.addEventListener('change', render);
  const reset = () => {
    const halfAngle = THREE.MathUtils.degToRad(20);
    const distance =
      (radius / Math.sin(Math.atan(Math.tan(halfAngle) * Math.min(camera.aspect, 1)))) * 1.15;
    camera.position.set(distance * 0.707, radius * 0.2, distance * 0.707);
    controls!.target.set(0, 0, 0);
    controls!.update();
    render();
  };
  const size = () => {
    if (disposed) return;
    camera.aspect = Math.max(host.clientWidth, 1) / Math.max(host.clientHeight, 1);
    camera.updateProjectionMatrix();
    renderer!.setSize(host.clientWidth, host.clientHeight);
    reset();
  };
  resize = new ResizeObserver(size);
  resize.observe(host);
  document.getElementById('reset')!.addEventListener('click', reset);
  size();
  clearTimeout(timer);
  if (thumbnail) {
    publishThumbnail({ image: renderer.domElement.toDataURL('image/png') });
    dispose();
    return;
  }
  status.textContent = '真实 MDL · ' + triangles.toLocaleString() + ' 三角面 · 拖拽旋转 / 滚轮缩放';
  document.body.dataset.state = 'ready';
  renderer.domElement.addEventListener(
    'webglcontextlost',
    () => {
      status.textContent = '图形上下文已释放，请关闭后重新打开预览。';
      document.body.dataset.state = 'error';
      dispose();
    },
    { once: true }
  );
}
void main().catch((error) => {
  status.textContent = abort.signal.aborted
    ? '模型加载已停止或超时，请关闭后重新打开；不会重新生成。'
    : error.message;
  document.body.dataset.state = 'error';
  publishThumbnail({ error: status.textContent || '模型预览加载失败。' });
  dispose();
});
