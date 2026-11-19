import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ChevronDown,
  ChevronUp,
  RotateCcw,
  X,
} from 'lucide-react';
import type { DecisionRecord } from '../types/decision';
import { computeScene3DBalanceModel } from '../utils/scene3dMath';

interface Decision3DStudioProps {
  open: boolean;
  decision: DecisionRecord;
  onClose: () => void;
}

type CameraPresetId = 'hero' | 'scale' | 'columns' | 'top';
type FinishPresetId = 'brass' | 'titanium' | 'bronze';
type DisplayModeId = 'combined' | 'scale-focus';

interface CameraPreset {
  id: CameraPresetId;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}

interface FinishPalette {
  id: FinishPresetId;
  label: string;
  swatchHex: string;
  metalColor: number;
  metalRoughness: number;
  metalMetalness: number;
  accentProColor: number;
  accentConColor: number;
  plinthColor: number;
  leaderCrownColor: number;
}

const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: 'hero',
    label: 'Огляд',
    position: [5.4, 3.6, 6.2],
    target: [0, 1.55, -0.35],
  },
  {
    id: 'scale',
    label: 'Терези',
    position: [0.35, 2.35, 4.9],
    target: [0, 1.85, 0.85],
  },
  {
    id: 'columns',
    label: 'Стовпці варіантів',
    position: [-4.4, 3.1, 4.8],
    target: [0, 1.4, -1.65],
  },
  {
    id: 'top',
    label: 'Зверху',
    position: [0.0, 8.6, 2.6],
    target: [0, 0.9, -0.45],
  },
];

const FINISH_PRESETS: FinishPalette[] = [
  {
    id: 'brass',
    label: 'Латунь і сланець',
    swatchHex: '#C59B43',
    metalColor: 0xc9a14a,
    metalRoughness: 0.28,
    metalMetalness: 0.88,
    accentProColor: 0x1d4ed8,
    accentConColor: 0x64748b,
    plinthColor: 0xd8dce3,
    leaderCrownColor: 0xd99b26,
  },
  {
    id: 'titanium',
    label: 'Титан і кобальт',
    swatchHex: '#64748B',
    metalColor: 0x94a3b8,
    metalRoughness: 0.24,
    metalMetalness: 0.92,
    accentProColor: 0x0f766e,
    accentConColor: 0x475569,
    plinthColor: 0xe2e6ec,
    leaderCrownColor: 0x0284c7,
  },
  {
    id: 'bronze',
    label: 'Бронза і графіт',
    swatchHex: '#9A6342',
    metalColor: 0xa46a46,
    metalRoughness: 0.34,
    metalMetalness: 0.84,
    accentProColor: 0x047857,
    accentConColor: 0x52525b,
    plinthColor: 0xdcd6ce,
    leaderCrownColor: 0xd97706,
  },
];

function detectSoftwareWebGL(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = debugExt
      ? String(gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) ?? '')
      : String(gl.getParameter(gl.RENDERER) ?? '');
    return /swiftshader|llvmpipe|software|mesa|angle.*swiftshader/i.test(
      rendererStr,
    );
  } catch {
    return true;
  }
}

function createBrushedMetalMaps(maxAnisotropy: number): {
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = 256;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 1) {
    const streak = 112 + Math.floor(((Math.sin(y * 1.9) + Math.cos(y * 0.43)) * 0.5 + 0.5) * 32);
    bCtx.fillStyle = `rgb(${streak},${streak},${streak})`;
    bCtx.fillRect(0, y, size, 1);
  }
  for (let i = 0; i < 420; i += 1) {
    const y = (i * 37) % size;
    const x = (i * 73) % size;
    const len = 18 + (i % 64);
    bCtx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    bCtx.fillRect(x, y, len, 1);
  }

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 2);
  bumpMap.anisotropy = maxAnisotropy;

  const roughMap = new THREE.CanvasTexture(bumpCanvas);
  roughMap.colorSpace = THREE.NoColorSpace;
  roughMap.wrapS = THREE.RepeatWrapping;
  roughMap.wrapT = THREE.RepeatWrapping;
  roughMap.repeat.set(2, 2);
  roughMap.anisotropy = maxAnisotropy;

  return { bumpMap, roughnessMap: roughMap };
}

function createStonePlinthMaps(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 256;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const aCtx = albedoCanvas.getContext('2d')!;
  aCtx.fillStyle = '#dfe3e8';
  aCtx.fillRect(0, 0, size, size);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  // Deterministic mineral speckle for travertine / architectural stone feel
  let seed = 42;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let i = 0; i < 1600; i += 1) {
    const x = nextRand() * size;
    const y = nextRand() * size;
    const r = 0.8 + nextRand() * 2.6;
    const tone = Math.floor(205 + nextRand() * 34);
    aCtx.fillStyle = `rgba(${tone},${tone - 2},${tone - 5},0.35)`;
    aCtx.beginPath();
    aCtx.arc(x, y, r, 0, Math.PI * 2);
    aCtx.fill();

    const bTone = Math.floor(108 + nextRand() * 40);
    bCtx.fillStyle = `rgba(${bTone},${bTone},${bTone},0.4)`;
    bCtx.beginPath();
    bCtx.arc(x, y, r, 0, Math.PI * 2);
    bCtx.fill();
  }

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 3);
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(3, 3);
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.5,
  );
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.34)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.14)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBeveledBeamGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-1.82, -0.055);
  shape.lineTo(-0.22, -0.11);
  shape.lineTo(0.22, -0.11);
  shape.lineTo(1.82, -0.055);
  shape.lineTo(1.82, 0.055);
  shape.lineTo(0.24, 0.125);
  shape.lineTo(-0.24, 0.125);
  shape.lineTo(-1.82, 0.055);
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.022,
    bevelSegments: 3,
  });
  geom.center();
  return geom;
}

function createRoundedRectExtrude(
  width: number,
  depth: number,
  height: number,
  radius: number,
): THREE.ExtrudeGeometry {
  const hw = width / 2;
  const hd = depth / 2;
  const r = Math.min(radius, hw * 0.4, hd * 0.4);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  // Rotate so extrude depth rises cleanly along +Y starting at y=0
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, 0.03, 0);
  return geom;
}

export function Decision3DStudio({
  open,
  decision,
  onClose,
}: Decision3DStudioProps) {
  const canvasMountRef = useRef<HTMLDivElement>(null);

  const [activePreset, setActivePreset] = useState<CameraPresetId>('hero');
  const [finishId, setFinishId] = useState<FinishPresetId>('brass');
  const [displayMode, setDisplayMode] = useState<DisplayModeId>('combined');
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const balanceModel = useMemo(
    () => computeScene3DBalanceModel(decision),
    [decision],
  );

  // Refs bridging React controls to the single mounted WebGL scene
  const balanceModelRef = useRef(balanceModel);
  balanceModelRef.current = balanceModel;
  const finishIdRef = useRef<FinishPresetId>(finishId);
  finishIdRef.current = finishId;
  const displayModeRef = useRef<DisplayModeId>(displayMode);
  displayModeRef.current = displayMode;

  const sceneActionsRef = useRef<{
    applyCameraPreset: (presetId: CameraPresetId) => void;
    applyFinish: (presetId: FinishPresetId) => void;
    applyDisplayMode: (mode: DisplayModeId) => void;
    resetView: () => void;
  } | null>(null);

  // Keyboard shortcuts: Escape closes studio, H toggles dock visibility
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      } else if (
        (event.key === 'h' || event.key === 'H') &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        setDockCollapsed((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const mount = canvasMountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    const isSoftwareGl = detectSoftwareWebGL(renderer);
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, isSoftwareGl ? 1 : 2),
    );
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgColor = new THREE.Color('#e8edf3');
    scene.background = bgColor;
    scene.fog = new THREE.Fog('#e8edf3', 14, 34);

    // Mandatory RoomEnvironment IBL on every device (including software GL)
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    roomEnv.dispose();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 80);
    const heroPreset = CAMERA_PRESETS[0];
    camera.position.set(...heroPreset.position);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...heroPreset.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 3.8;
    controls.maxDistance = 15.5;
    controls.maxPolarAngle = Math.PI * 0.475;
    controls.update();

    // Lighting rig: warm key + cool sky hemisphere + subtle architectural rim
    const hemiLight = new THREE.HemisphereLight('#d6e6ff', '#d8d0c4', 0.68);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight('#fff3df', 2.25);
    keyLight.position.set(5.5, 9.2, 6.4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(
      isSoftwareGl ? 512 : 2048,
      isSoftwareGl ? 512 : 2048,
    );
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 26;
    keyLight.shadow.camera.left = -6.5;
    keyLight.shadow.camera.right = 6.5;
    keyLight.shadow.camera.top = 6.5;
    keyLight.shadow.camera.bottom = -6.5;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#cfe0ff', 0.65);
    rimLight.position.set(-6.0, 5.2, -5.5);
    scene.add(rimLight);

    // Procedural CanvasTexture maps (zero external fetches)
    const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const metalMaps = createBrushedMetalMaps(maxAnisotropy);
    const stoneMaps = createStonePlinthMaps(maxAnisotropy);
    const contactShadowTex = createContactShadowTexture();

    const initialPalette =
      FINISH_PRESETS.find((p) => p.id === finishIdRef.current) ??
      FINISH_PRESETS[0];

    const metalMat = new THREE.MeshStandardMaterial({
      color: initialPalette.metalColor,
      metalness: initialPalette.metalMetalness,
      roughness: initialPalette.metalRoughness,
      bumpMap: metalMaps.bumpMap,
      bumpScale: 0.015,
      roughnessMap: metalMaps.roughnessMap,
    });

    const darkSlateMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.25,
      roughness: 0.42,
      bumpMap: metalMaps.bumpMap,
      bumpScale: 0.008,
    });

    const plinthMat = new THREE.MeshStandardMaterial({
      color: initialPalette.plinthColor,
      map: stoneMaps.map,
      bumpMap: stoneMaps.bumpMap,
      bumpScale: 0.012,
      roughness: 0.78,
      metalness: 0.04,
    });

    const proMat = new THREE.MeshStandardMaterial({
      color: initialPalette.accentProColor,
      metalness: 0.18,
      roughness: 0.34,
      bumpMap: metalMaps.bumpMap,
      bumpScale: 0.008,
    });

    const conMat = new THREE.MeshStandardMaterial({
      color: initialPalette.accentConColor,
      metalness: 0.22,
      roughness: 0.48,
      bumpMap: metalMaps.bumpMap,
      bumpScale: 0.01,
    });

    const crownMat = new THREE.MeshStandardMaterial({
      color: initialPalette.leaderCrownColor,
      metalness: 0.9,
      roughness: 0.18,
      emissive: new THREE.Color(initialPalette.leaderCrownColor),
      emissiveIntensity: 0.14,
    });

    const shadowPlaneMat = new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
    });

    // Studio floor extending to horizon fog
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xe2e7ee,
      roughness: 0.92,
      metalness: 0.02,
    });
    const floorMesh = new THREE.Mesh(new THREE.CircleGeometry(38, 48), floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // 1. Architectural Stepped Plinth (3-part composite THREE.Group, grounded flush at y = 0)
    const plinthGroup = new THREE.Group();
    const outerPlinth = new THREE.Mesh(
      new THREE.CylinderGeometry(4.35, 4.55, 0.22, 64),
      plinthMat,
    );
    outerPlinth.position.y = 0.11;
    outerPlinth.receiveShadow = true;
    outerPlinth.castShadow = true;
    plinthGroup.add(outerPlinth);

    const inlayRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.85, 0.028, 12, 72),
      metalMat,
    );
    inlayRing.rotation.x = Math.PI / 2;
    inlayRing.position.y = 0.225;
    plinthGroup.add(inlayRing);

    const innerStage = new THREE.Mesh(
      new THREE.CylinderGeometry(3.7, 3.82, 0.12, 64),
      darkSlateMat,
    );
    innerStage.position.y = 0.28;
    innerStage.receiveShadow = true;
    plinthGroup.add(innerStage);

    const plinthContactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(10.6, 10.6),
      shadowPlaneMat,
    );
    plinthContactShadow.rotation.x = -Math.PI / 2;
    plinthContactShadow.position.y = 0.004;
    plinthGroup.add(plinthContactShadow);
    scene.add(plinthGroup);

    const STAGE_TOP_Y = 0.34;
    const model = balanceModelRef.current;

    // 2. Executive Sculptural Balance Scale (10+ part composite THREE.Group)
    const scaleGroup = new THREE.Group();
    scaleGroup.position.set(0, STAGE_TOP_Y, 0.85);

    const scaleShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      shadowPlaneMat,
    );
    scaleShadow.rotation.x = -Math.PI / 2;
    scaleShadow.position.y = 0.006;
    scaleGroup.add(scaleShadow);

    // Turned LatheGeometry pedestal column
    const lathePoints = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.58, 0.0),
      new THREE.Vector2(0.56, 0.1),
      new THREE.Vector2(0.42, 0.18),
      new THREE.Vector2(0.26, 0.32),
      new THREE.Vector2(0.18, 0.58),
      new THREE.Vector2(0.14, 1.38),
      new THREE.Vector2(0.19, 1.54),
      new THREE.Vector2(0.13, 1.72),
      new THREE.Vector2(0.16, 1.98),
      new THREE.Vector2(0.08, 2.18),
      new THREE.Vector2(0.0, 2.26),
    ];
    const pedestalMesh = new THREE.Mesh(
      new THREE.LatheGeometry(lathePoints, 32),
      metalMat,
    );
    pedestalMesh.castShadow = true;
    pedestalMesh.receiveShadow = true;
    scaleGroup.add(pedestalMesh);

    // Dark slate base ring collar around pedestal
    const collarMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.68, 0.08, 36),
      darkSlateMat,
    );
    collarMesh.position.y = 0.04;
    collarMesh.castShadow = true;
    collarMesh.receiveShadow = true;
    scaleGroup.add(collarMesh);

    // Graduated calibration arc behind fulcrum
    const arcMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.48, 0.018, 12, 32, Math.PI * 0.72),
      metalMat,
    );
    arcMesh.position.set(0, 1.94, -0.14);
    arcMesh.rotation.z = Math.PI * 0.14;
    scaleGroup.add(arcMesh);

    // Fulcrum axle hub
    const fulcrumHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.24, 24),
      darkSlateMat,
    );
    fulcrumHub.rotation.x = Math.PI / 2;
    fulcrumHub.position.set(0, 1.96, 0);
    fulcrumHub.castShadow = true;
    scaleGroup.add(fulcrumHub);

    // Pivoting beam assembly
    const beamPivot = new THREE.Group();
    beamPivot.position.set(0, 1.96, 0);
    beamPivot.rotation.z = model.beamTiltRad;

    const beamMesh = new THREE.Mesh(createBeveledBeamGeometry(), metalMat);
    beamMesh.castShadow = true;
    beamMesh.receiveShadow = true;
    beamPivot.add(beamMesh);

    // Central upright indicator needle
    const needleMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.036, 0.56, 16),
      crownMat,
    );
    needleMesh.position.set(0, 0.34, 0);
    needleMesh.castShadow = true;
    beamPivot.add(needleMesh);

    // End cap pins at +/- 1.65m
    const BEAM_HALF_SPAN = 1.65;
    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 0.22, 18),
        darkSlateMat,
      );
      cap.rotation.x = Math.PI / 2;
      cap.position.set(side * BEAM_HALF_SPAN, 0, 0);
      cap.castShadow = true;
      beamPivot.add(cap);
    }
    scaleGroup.add(beamPivot);

    // Hanging pan builder (always stays vertically plumb as beam tilts!)
    function createPanAssembly(score: number, isDominant: boolean): THREE.Group {
      const panGroup = new THREE.Group();

      // Three thin suspension cables curving from hook to dish rim
      const cableAngles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
      for (const angle of cableAngles) {
        const rimX = Math.cos(angle) * 0.44;
        const rimZ = Math.sin(angle) * 0.44;
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(rimX * 0.55, -0.46, rimZ * 0.55),
          new THREE.Vector3(rimX, -0.92, rimZ),
        ]);
        const cable = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 12, 0.012, 8, false),
          metalMat,
        );
        cable.castShadow = true;
        panGroup.add(cable);
      }

      // Turned LatheGeometry shallow weighing dish
      const dishPoints = [
        new THREE.Vector2(0.0, -1.03),
        new THREE.Vector2(0.28, -1.02),
        new THREE.Vector2(0.46, -0.95),
        new THREE.Vector2(0.49, -0.91),
        new THREE.Vector2(0.44, -0.91),
        new THREE.Vector2(0.25, -0.98),
        new THREE.Vector2(0.0, -0.99),
      ];
      const dishMesh = new THREE.Mesh(
        new THREE.LatheGeometry(dishPoints, 32),
        metalMat,
      );
      dishMesh.castShadow = true;
      dishMesh.receiveShadow = true;
      panGroup.add(dishMesh);

      // Weighted chamfered decision block sitting inside the dish
      const blockHeight = 0.16 + (Math.max(10, Math.min(100, score)) / 100) * 0.44;
      const weightBlock = new THREE.Mesh(
        createRoundedRectExtrude(0.44, 0.44, blockHeight, 0.08),
        isDominant ? proMat : conMat,
      );
      weightBlock.position.y = -0.985;
      weightBlock.castShadow = true;
      weightBlock.receiveShadow = true;
      panGroup.add(weightBlock);

      return panGroup;
    }

    const leftPan = createPanAssembly(
      model.leftScore,
      model.leftScore >= model.rightScore,
    );
    const rightPan = createPanAssembly(
      model.rightScore,
      model.rightScore > model.leftScore,
    );
    scaleGroup.add(leftPan);
    scaleGroup.add(rightPan);

    function syncPanPositions(tiltRad: number) {
      const cosT = Math.cos(tiltRad);
      const sinT = Math.sin(tiltRad);
      leftPan.position.set(
        -BEAM_HALF_SPAN * cosT,
        1.96 - BEAM_HALF_SPAN * sinT,
        0,
      );
      rightPan.position.set(
        BEAM_HALF_SPAN * cosT,
        1.96 + BEAM_HALF_SPAN * sinT,
        0,
      );
    }
    syncPanPositions(model.beamTiltRad);
    scene.add(scaleGroup);

    // 3. Architectural Option Monoliths (arranged in rear semicircle behind scale)
    const columnsGroup = new THREE.Group();
    columnsGroup.position.set(0, STAGE_TOP_Y, -1.65);

    const crownRings: THREE.Mesh[] = [];
    model.columns.forEach((col, idx) => {
      const colGroup = new THREE.Group();
      const arcOffsetZ = Math.abs(col.xPosition) * 0.18;
      colGroup.position.set(col.xPosition, 0, arcOffsetZ);

      // Soft contact shadow disc
      const cShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.45, 1.45),
        shadowPlaneMat,
      );
      cShadow.rotation.x = -Math.PI / 2;
      cShadow.position.y = 0.005;
      colGroup.add(cShadow);

      // Recessed architectural socket base
      const socket = new THREE.Mesh(
        createRoundedRectExtrude(0.92, 0.92, 0.14, 0.1),
        darkSlateMat,
      );
      socket.castShadow = true;
      socket.receiveShadow = true;
      colGroup.add(socket);

      // Lower Pro-argument beveled monolith
      const proTower = new THREE.Mesh(
        createRoundedRectExtrude(0.68, 0.68, col.proSegmentHeight, 0.08),
        proMat,
      );
      proTower.position.y = 0.14;
      proTower.castShadow = true;
      proTower.receiveShadow = true;
      colGroup.add(proTower);

      // Metallic datum band separating Pro and Con sections
      const datumBand = new THREE.Mesh(
        createRoundedRectExtrude(0.74, 0.74, 0.055, 0.08),
        metalMat,
      );
      datumBand.position.y = 0.14 + col.proSegmentHeight + 0.03;
      datumBand.castShadow = true;
      colGroup.add(datumBand);

      // Upper Con-counterbalance monolith
      const conTower = new THREE.Mesh(
        createRoundedRectExtrude(0.62, 0.62, col.conSegmentHeight, 0.08),
        conMat,
      );
      conTower.position.y = 0.14 + col.proSegmentHeight + 0.11;
      conTower.castShadow = true;
      conTower.receiveShadow = true;
      colGroup.add(conTower);

      // Crown halo ring on leading or chosen option
      const topY = 0.14 + col.proSegmentHeight + 0.11 + col.conSegmentHeight + 0.24;
      if (col.isLeader || col.isChosen) {
        const crown = new THREE.Mesh(
          new THREE.TorusGeometry(0.36, 0.028, 14, 36),
          crownMat,
        );
        crown.rotation.x = Math.PI / 2;
        crown.position.y = topY;
        crown.castShadow = true;
        crown.userData.baseY = topY;
        crown.userData.phase = idx * 0.9;
        colGroup.add(crown);
        crownRings.push(crown);
      }

      columnsGroup.add(colGroup);
    });
    scene.add(columnsGroup);

    // Camera transition state & coalesced rendering scheduler
    let currentBeamTilt = model.beamTiltRad;
    let targetCamPos: THREE.Vector3 | null = null;
    let targetLookAt: THREE.Vector3 | null = null;
    let rafId = 0;
    let softwareTimerId = 0;
    let renderQueued = false;
    let disposed = false;

    const startTimeMs = performance.now();
    let lastTimeMs = startTimeMs;

    function drawFrame() {
      if (disposed) return;
      renderer.render(scene, camera);
    }

    function requestRender() {
      if (disposed || renderQueued) return;
      renderQueued = true;
      rafId = window.requestAnimationFrame(() => {
        renderQueued = false;
        if (disposed) return;
        controls.update();
        drawFrame();
      });
    }

    function scheduleSoftwareTransition() {
      if (disposed) return;
      if (softwareTimerId) window.clearTimeout(softwareTimerId);
      const step = () => {
        if (disposed) return;
        if (targetCamPos && targetLookAt) {
          camera.position.lerp(targetCamPos, 0.38);
          controls.target.lerp(targetLookAt, 0.38);
          if (
            camera.position.distanceTo(targetCamPos) < 0.04 &&
            controls.target.distanceTo(targetLookAt) < 0.04
          ) {
            camera.position.copy(targetCamPos);
            controls.target.copy(targetLookAt);
            targetCamPos = null;
            targetLookAt = null;
          }
          controls.update();
          drawFrame();
          if (targetCamPos) {
            rafId = window.requestAnimationFrame(() => {
              softwareTimerId = window.setTimeout(step, 16);
            });
          }
        }
      };
      step();
    }

    function animateHardware() {
      if (disposed) return;
      rafId = window.requestAnimationFrame(animateHardware);
      const nowMs = performance.now();
      const dt = Math.min((nowMs - lastTimeMs) / 1000, 0.05);
      lastTimeMs = nowMs;
      const elapsed = (nowMs - startTimeMs) / 1000;

      // Subtle living micro-oscillation around exact analytical balance angle
      const targetTilt =
        balanceModelRef.current.beamTiltRad + Math.sin(elapsed * 1.15) * 0.008;
      currentBeamTilt = THREE.MathUtils.damp(currentBeamTilt, targetTilt, 4.5, dt);
      beamPivot.rotation.z = currentBeamTilt;
      syncPanPositions(currentBeamTilt);

      // Gentle crown float on leading/chosen option
      for (const ring of crownRings) {
        const baseY = Number(ring.userData.baseY ?? 2.0);
        const phase = Number(ring.userData.phase ?? 0);
        ring.position.y = baseY + Math.sin(elapsed * 1.6 + phase) * 0.04;
        ring.rotation.z = elapsed * 0.35;
      }

      if (targetCamPos && targetLookAt) {
        const lambda = 6.5;
        camera.position.x = THREE.MathUtils.damp(
          camera.position.x,
          targetCamPos.x,
          lambda,
          dt,
        );
        camera.position.y = THREE.MathUtils.damp(
          camera.position.y,
          targetCamPos.y,
          lambda,
          dt,
        );
        camera.position.z = THREE.MathUtils.damp(
          camera.position.z,
          targetCamPos.z,
          lambda,
          dt,
        );
        controls.target.x = THREE.MathUtils.damp(
          controls.target.x,
          targetLookAt.x,
          lambda,
          dt,
        );
        controls.target.y = THREE.MathUtils.damp(
          controls.target.y,
          targetLookAt.y,
          lambda,
          dt,
        );
        controls.target.z = THREE.MathUtils.damp(
          controls.target.z,
          targetLookAt.z,
          lambda,
          dt,
        );

        if (
          camera.position.distanceTo(targetCamPos) < 0.025 &&
          controls.target.distanceTo(targetLookAt) < 0.025
        ) {
          targetCamPos = null;
          targetLookAt = null;
        }
      }

      controls.update();
      drawFrame();
    }

    const handleControlsStart = () => {
      // User manual drag cancels programmatic fly-to
      targetCamPos = null;
      targetLookAt = null;
    };

    const handleControlsChange = () => {
      if (isSoftwareGl) {
        requestRender();
      }
    };

    controls.addEventListener('start', handleControlsStart);
    controls.addEventListener('change', handleControlsChange);

    // Imperative actions called by React bottom dock
    sceneActionsRef.current = {
      applyCameraPreset(presetId) {
        const found = CAMERA_PRESETS.find((p) => p.id === presetId);
        if (!found) return;
        targetCamPos = new THREE.Vector3(...found.position);
        targetLookAt = new THREE.Vector3(...found.target);
        if (isSoftwareGl) {
          scheduleSoftwareTransition();
        }
      },
      applyFinish(presetId) {
        const palette = FINISH_PRESETS.find((p) => p.id === presetId);
        if (!palette) return;
        metalMat.color.setHex(palette.metalColor);
        metalMat.roughness = palette.metalRoughness;
        metalMat.metalness = palette.metalMetalness;
        proMat.color.setHex(palette.accentProColor);
        conMat.color.setHex(palette.accentConColor);
        plinthMat.color.setHex(palette.plinthColor);
        crownMat.color.setHex(palette.leaderCrownColor);
        crownMat.emissive.setHex(palette.leaderCrownColor);
        if (isSoftwareGl) {
          requestRender();
        }
      },
      applyDisplayMode(mode) {
        columnsGroup.visible = mode === 'combined';
        scaleGroup.position.z = mode === 'scale-focus' ? 0 : 0.85;
        if (isSoftwareGl) {
          requestRender();
        }
      },
      resetView() {
        const hero = CAMERA_PRESETS[0];
        targetCamPos = new THREE.Vector3(...hero.position);
        targetLookAt = new THREE.Vector3(...hero.target);
        if (isSoftwareGl) {
          scheduleSoftwareTransition();
        }
      },
    };

    // Apply initial display mode
    sceneActionsRef.current.applyDisplayMode(displayModeRef.current);

    function handleResize() {
      if (!mount || disposed) return;
      const nextW = mount.clientWidth || window.innerWidth;
      const nextH = mount.clientHeight || window.innerHeight;
      camera.aspect = nextW / nextH;
      camera.updateProjectionMatrix();
      renderer.setSize(nextW, nextH);
      if (isSoftwareGl) {
        requestRender();
      }
    }

    window.addEventListener('resize', handleResize);

    // Initial render
    drawFrame();
    if (!isSoftwareGl) {
      animateHardware();
    }

    return () => {
      disposed = true;
      sceneActionsRef.current = null;
      window.cancelAnimationFrame(rafId);
      if (softwareTimerId) window.clearTimeout(softwareTimerId);
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('start', handleControlsStart);
      controls.removeEventListener('change', handleControlsChange);
      controls.dispose();

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
        }
      });

      metalMat.dispose();
      darkSlateMat.dispose();
      plinthMat.dispose();
      proMat.dispose();
      conMat.dispose();
      crownMat.dispose();
      shadowPlaneMat.dispose();
      floorMat.dispose();

      metalMaps.bumpMap.dispose();
      metalMaps.roughnessMap.dispose();
      stoneMaps.map.dispose();
      stoneMaps.bumpMap.dispose();
      contactShadowTex.dispose();

      envRT.dispose();
      pmrem.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [open, decision.id]);

  if (!open) return null;

  function handleSelectPreset(presetId: CameraPresetId) {
    setActivePreset(presetId);
    sceneActionsRef.current?.applyCameraPreset(presetId);
  }

  function handleSelectFinish(presetId: FinishPresetId) {
    setFinishId(presetId);
    sceneActionsRef.current?.applyFinish(presetId);
  }

  function handleSelectMode(mode: DisplayModeId) {
    setDisplayMode(mode);
    sceneActionsRef.current?.applyDisplayMode(mode);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Інтерактивна 3D-сцена балансу рішення"
      className="fixed inset-0 z-40 w-screen h-screen bg-[#e8edf3] overflow-hidden select-none"
    >
      {/* Isolated Full-Viewport WebGL Canvas Host (zero React children) */}
      <div
        ref={canvasMountRef}
        data-testid="threejs-canvas-host"
        className="w-full h-full"
      />

      {/* Top-left compact title & live balance readout (solid rgba, NO backdrop-filter) */}
      <div className="pointer-events-none fixed top-4 left-4 right-20 sm:right-auto sm:max-w-md z-10">
        <div className="pointer-events-auto bg-[#ffffffeb] border border-slate-300/90 rounded-xl px-4 py-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            3D-баланс рішення
          </p>
          <h2 className="font-display text-sm sm:text-base font-bold text-slate-950 truncate mt-0.5">
            {decision.title}
          </h2>
          <div className="mt-2 space-y-1 text-xs text-slate-700">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate font-medium text-slate-900">
                {balanceModel.leftOptionName}
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-950 shrink-0">
                {balanceModel.leftScore}%
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="truncate font-medium text-slate-900">
                {balanceModel.rightOptionName}
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-950 shrink-0">
                {balanceModel.rightScore}%
              </span>
            </div>
            {balanceModel.leaderName && (
              <div className="pt-1 border-t border-slate-200 font-semibold text-blue-700 truncate">
                Лідер балансу: {balanceModel.leaderName}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top-right Close Studio button */}
      <div className="fixed top-4 right-4 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setActivePreset('hero');
            sceneActionsRef.current?.resetView();
          }}
          aria-label="Скинути ракурс камери"
          title="Скинути ракурс"
          className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#fffffff0] hover:bg-white text-slate-800 border border-slate-300 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрити 3D-сцену"
          className="inline-flex items-center gap-1.5 px-3.5 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <X className="w-4 h-4" />
          <span className="hidden sm:inline">Закрити</span>
        </button>
      </div>

      {/* Single Collapsible Bottom Control Dock (<= 15% viewport, solid surface, zero backdrop-filter) */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-10 w-[calc(100%-2rem)] max-w-3xl">
        {dockCollapsed ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setDockCollapsed(false)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#fffffff2] border border-slate-300 shadow-sm text-xs font-semibold text-slate-800 hover:bg-white transition-colors"
            >
              <ChevronUp className="w-4 h-4" />
              Панель керування 3D (H)
            </button>
          </div>
        ) : (
          <div className="bg-[#fffffff2] border border-slate-300 rounded-xl px-4 py-3 shadow-md space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Camera Presets */}
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Ракурси камери">
                {CAMERA_PRESETS.map((preset) => {
                  const active = activePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset.id)}
                      className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              {/* Material Finish Swatches + Display Mode + Collapse */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-1.5" role="group" aria-label="Оздоблення матеріалів">
                  {FINISH_PRESETS.map((finish) => {
                    const active = finishId === finish.id;
                    return (
                      <button
                        key={finish.id}
                        type="button"
                        onClick={() => handleSelectFinish(finish.id)}
                        aria-label={finish.label}
                        title={finish.label}
                        className={`w-6 h-6 rounded-full border-2 transition-transform ${
                          active
                            ? 'border-blue-700 scale-110'
                            : 'border-white ring-1 ring-slate-300'
                        }`}
                        style={{ backgroundColor: finish.swatchHex }}
                      />
                    );
                  })}
                </div>

                <div className="h-5 w-px bg-slate-200 hidden sm:block" aria-hidden="true" />

                <div className="flex items-center gap-1" role="group" aria-label="Режим сцени">
                  <button
                    type="button"
                    onClick={() => handleSelectMode('combined')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      displayMode === 'combined'
                        ? 'bg-blue-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Повна сцена
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectMode('scale-focus')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      displayMode === 'scale-focus'
                        ? 'bg-blue-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Тільки терези
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setDockCollapsed(true)}
                  aria-label="Згорнути панель керування (клавіша H)"
                  title="Сховати панель (H)"
                  className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
