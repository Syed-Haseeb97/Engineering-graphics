import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { WireframeMesh3D } from '../../kernel/worker/types';

export type InspectorView = 'iso' | 'front' | 'top' | 'side';

const VIEW_DIRECTIONS: Record<InspectorView, THREE.Vector3> = {
  // X right, Y towards the viewer (front of VP), Z up.
  iso: new THREE.Vector3(1.05, 1.45, 0.85),
  front: new THREE.Vector3(0, 1, 0.02),
  top: new THREE.Vector3(0, 0.02, 1),
  side: new THREE.Vector3(1, 0.02, 0.28),
};

/**
 * Renders the placed solid as a shaded, edge-overlaid 3D model with the HP/VP/PP
 * reference planes. The camera automatically frames the solid so it never gets
 * lost among the reference grids.
 */
export class Inspector3D {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private solidGroup = new THREE.Group();
  private scaffoldGroup = new THREE.Group();
  private animFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private currentView: InspectorView = 'iso';
  private bounds = new THREE.Box3(new THREE.Vector3(-20, 0, 0), new THREE.Vector3(20, 50, 60));
  private planesVisible = true;

  constructor(container: HTMLElement) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf8fafc);
    this.scene.add(this.scaffoldGroup);
    this.scene.add(this.solidGroup);

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 280);
    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 5000);
    this.camera.up.set(0, 0, 1);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.rotateSpeed = 0.75;

    this.addLights();
    this.buildScaffold(this.bounds);
    this.setView('iso');

    this.startAnimation();
    this.initResizeObserver();
  }

  private addLights(): void {
    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.35);
    this.scene.add(hemisphere);

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(140, 220, 260);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xbfdbfe, 0.9);
    fill.position.set(-180, 120, 60);
    this.scene.add(fill);
  }

  /** Replace the rendered solid. Accepts shaded mesh data or an edge-only fallback. */
  public updateSolid(meshData: WireframeMesh3D): void {
    this.clearGroup(this.solidGroup);

    if (meshData.points.length < 6 && !(meshData.positions && meshData.positions.length >= 9)) {
      return;
    }

    let bounds: THREE.Box3 | null = null;

    if (meshData.positions && meshData.positions.length >= 9 && meshData.indices && meshData.indices.length >= 3) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(meshData.positions, 3),
      );
      if (meshData.normals && meshData.normals.length === meshData.positions.length) {
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(meshData.normals, 3));
      }
      geometry.setIndex(meshData.indices);
      geometry.computeBoundingBox();
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();

      const material = new THREE.MeshStandardMaterial({
        color: 0x8fc2ec,
        metalness: 0.05,
        roughness: 0.58,
        emissive: 0x0b2a45,
        emissiveIntensity: 0.12,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.94,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 1;
      this.solidGroup.add(mesh);
      bounds = geometry.boundingBox ? geometry.boundingBox.clone() : null;
    }

    if (meshData.points.length >= 6) {
      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(meshData.points, 3),
      );
      edgeGeometry.computeBoundingBox();
      if (!bounds && edgeGeometry.boundingBox) bounds = edgeGeometry.boundingBox.clone();

      const edgeMaterial = new THREE.LineBasicMaterial({
        color: 0x0f172a,
        transparent: true,
        opacity: 0.95,
      });
      const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
      edges.renderOrder = 2;
      this.solidGroup.add(edges);
    }

    if (bounds && !bounds.isEmpty()) {
      this.bounds = padBounds(bounds, 4);
      this.buildScaffold(this.bounds);
      this.setView(this.currentView);
    }
  }

  /** Snap the camera to a standard orthographic-like inspection direction. */
  public setView(view: InspectorView, preserveDistance = false): void {
    this.currentView = view;
    const center = this.bounds.getCenter(new THREE.Vector3());
    const size = this.bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 18);
    const fov = (this.camera.fov * Math.PI) / 180;
    const fitHeight = radius / Math.tan(fov / 2);
    const fitWidth = fitHeight / Math.max(this.camera.aspect, 0.2);
    const distance =
      (preserveDistance ? this.camera.position.distanceTo(this.controls.target) : Math.max(fitHeight, fitWidth) * 1.18);

    const direction = VIEW_DIRECTIONS[view].clone().normalize();
    // A top view is degenerate with a Z-up camera, so use Y-up for that preset.
    this.camera.up.set(0, 0, 1);
    if (view === 'top') this.camera.up.set(0, 1, 0);

    this.camera.position.copy(center).addScaledVector(direction, Math.max(distance, radius * 1.6));
    this.camera.lookAt(center);
    this.camera.near = Math.max(0.5, distance / 1000);
    this.camera.far = Math.max(2000, distance * 20);
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(center);
    this.controls.minDistance = radius * 0.55;
    this.controls.maxDistance = radius * 12;
    this.controls.update();
  }

  public getView(): InspectorView {
    return this.currentView;
  }

  public setPlanesVisible(visible: boolean): void {
    this.planesVisible = visible;
    this.scaffoldGroup.visible = visible;
  }

  public arePlanesVisible(): boolean {
    return this.planesVisible;
  }

  private buildScaffold(bounds: THREE.Box3): void {
    this.clearGroup(this.scaffoldGroup);

    const size = bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 45);
    const pad = span * 0.28;

    const x0 = Math.min(0, bounds.min.x) - pad;
    const x1 = Math.max(bounds.max.x, 10) + pad;
    const y1 = Math.max(bounds.max.y, 10) + pad;
    const z0 = Math.min(0, bounds.min.z) - pad;
    const z1 = Math.max(bounds.max.z, 10) + pad;
    const width = x1 - x0;
    const depth = y1;
    const height = z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;

    // HP: Z = 0, first quadrant of the horizontal plane.
    this.addPlaneScaffold({
      width,
      height: depth,
      color: 0x0d9488,
      center: new THREE.Vector3(cx, depth / 2, 0),
      rotationX: 0,
      rotationY: 0,
    });

    // VP: Y = 0, behind the object.
    this.addPlaneScaffold({
      width,
      height,
      color: 0x2563eb,
      center: new THREE.Vector3(cx, 0, cz),
      rotationX: Math.PI / 2,
      rotationY: 0,
    });

    // PP: placed to the right of the solid, where the end elevation is taken.
    const ppX = Math.max(bounds.max.x, 8) + Math.max(pad * 0.7, 10);
    this.addPlaneScaffold({
      width: depth,
      height,
      color: 0xd97706,
      center: new THREE.Vector3(ppX, depth / 2, cz),
      rotationX: 0,
      rotationY: Math.PI / 2,
    });

    this.addAxes(x1, y1, z1, span);
  }

  private addPlaneScaffold(options: {
    width: number;
    height: number;
    color: number;
    center: THREE.Vector3;
    rotationX: number;
    rotationY: number;
  }): void {
    const { width, height, color, center, rotationX, rotationY } = options;

    const planeGeometry = new THREE.PlaneGeometry(width, height);
    const planeMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.055,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.position.copy(center);
    plane.rotation.set(rotationX, rotationY, 0);
    plane.renderOrder = -2;
    this.scaffoldGroup.add(plane);

    const divisions = Math.max(6, Math.min(24, Math.round(Math.max(width, height) / 10)));
    const gridGeometry = makeGridGeometry(width, height, divisions);
    const gridMaterial = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const grid = new THREE.LineSegments(gridGeometry, gridMaterial);
    grid.position.copy(center);
    grid.rotation.set(rotationX, rotationY, 0);
    grid.renderOrder = -1;
    this.scaffoldGroup.add(grid);
  }

  private addAxes(x1: number, y1: number, z1: number, span: number): void {
    const axes: Array<{ end: THREE.Vector3; color: number; label: string }> = [
      { end: new THREE.Vector3(x1, 0, 0), color: 0xdc2626, label: 'X' },
      { end: new THREE.Vector3(0, y1, 0), color: 0x16a34a, label: 'Y' },
      { end: new THREE.Vector3(0, 0, z1), color: 0x2563eb, label: 'Z' },
    ];

    for (const axis of axes) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        axis.end,
      ]);
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color: axis.color, transparent: true, opacity: 0.85 }),
      );
      line.renderOrder = 0;
      this.scaffoldGroup.add(line);

      const label = makeLabelSprite(axis.label, axis.color, span * 0.075);
      label.position.copy(axis.end).addScaledVector(axis.end.clone().normalize(), span * 0.05);
      this.scaffoldGroup.add(label);
    }
  }

  private clearGroup(group: THREE.Group): void {
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
        if (object instanceof THREE.Sprite) object.material.map?.dispose();
      });
    }
  }

  private startAnimation(): void {
    const render = (): void => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.animFrameId = requestAnimationFrame(render);
    };
    render();
  }

  private initResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      if (w > 0 && h > 0) {
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
      }
    });
    this.resizeObserver.observe(this.container);
  }

  public dispose(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.resizeObserver?.disconnect();
    this.controls.dispose();
    this.clearGroup(this.solidGroup);
    this.clearGroup(this.scaffoldGroup);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}

function padBounds(bounds: THREE.Box3, pad: number): THREE.Box3 {
  const min = bounds.min.clone().subScalar(pad);
  const max = bounds.max.clone().addScalar(pad);
  return new THREE.Box3(min, max);
}

/** Build a rectangular grid of line segments in the local XY plane. */
function makeGridGeometry(width: number, height: number, divisions: number): THREE.BufferGeometry {
  const vertices: number[] = [];
  const halfW = width / 2;
  const halfH = height / 2;

  for (let i = 0; i <= divisions; i++) {
    const x = -halfW + (width * i) / divisions;
    vertices.push(x, -halfH, 0, x, halfH, 0);
  }
  for (let i = 0; i <= divisions; i++) {
    const y = -halfH + (height * i) / divisions;
    vertices.push(-halfW, y, 0, halfW, y, 0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  return geometry;
}

/** Render a crisp, always-facing axis label. */
function makeLabelSprite(text: string, color: number, size: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.font = 'bold 88px -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 70);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size, size, size);
  sprite.renderOrder = 10;
  return sprite;
}
