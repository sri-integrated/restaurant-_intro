import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
 
/* ---------- Config ---------- */
// For .obj files, `mtl` is the materials file and `color` is the fallback
// colour used if the .mtl is missing. .glb files need only `file`.
const FOODS = [
  { name: "burger", file: "burger.obj", mtl: "model/burger.mtl", color: 0xc98a4b },
  { name: "donut",  file: "donut.obj",  mtl: "model/donut.mtl",  color: 0xe9a6bd },
  { name: "pizza",  file: "pizza.glb" },
];
const BG = ["#e8a33d", "#f2a7c3", "#f07a4a"].map((c) => new THREE.Color(c));
const MODEL_SIZE = 3.4;
 
const panels = [...document.querySelectorAll(".panel")];
const navBtns = [...document.querySelectorAll(".index button")];
const loader = document.getElementById("loader");
 
/* ---------- Renderer / scene ---------- */
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("stage"),
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
 
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
 
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(3, 5, 4);
scene.add(key);
 
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, 0, 9);
 
/* ---------- Loading (.obj and .glb) ---------- */
const gltfLoader = new GLTFLoader();
 
function loadObj(food, materials) {
  return new Promise((resolve, reject) => {
    const objLoader = new OBJLoader();
    if (materials) objLoader.setMaterials(materials);
    objLoader.load(
      food.file,
      (obj) => {
        if (!materials) {
          // No .mtl: give every mesh a plain material so it isn't black
          obj.traverse((c) => {
            if (c.isMesh) {
              c.material = new THREE.MeshStandardMaterial({
                color: food.color ?? 0xcccccc,
                roughness: 0.6,
              });
            }
          });
        }
        resolve(obj);
      },
      undefined,
      reject
    );
  });
}
 
function loadModel(food) {
  if (food.file.endsWith(".obj")) {
    if (!food.mtl) return loadObj(food, null);
    return new Promise((resolve, reject) => {
      const mtlLoader = new MTLLoader();
      mtlLoader.setResourcePath("model/"); // folder holding the textures
      mtlLoader.load(
        food.mtl,
        (mats) => {
          mats.preload();
          loadObj(food, mats).then(resolve, reject);
        },
        undefined,
        () => loadObj(food, null).then(resolve, reject) // .mtl missing
      );
    });
  }
  return new Promise((resolve, reject) =>
    gltfLoader.load(food.file, (g) => resolve(g.scene), undefined, reject)
  );
}
 
/* ---------- Rigs: rig (animated) > pivot (scaled) > model (centred) ---------- */
const rigs = FOODS.map(() => {
  const rig = new THREE.Group();
  rig.visible = false;
  scene.add(rig);
  return rig;
});
 
let loaded = 0;
FOODS.forEach((food, i) => {
  loadModel(food)
    .then((model) => {
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
 
      const pivot = new THREE.Group();
      pivot.scale.setScalar(MODEL_SIZE / Math.max(size.x, size.y, size.z));
      pivot.add(model);
 
      rigs[i].add(pivot);
      rigs[i].rotation.x = 0.35; // tilt so the top is visible
    })
    .catch((err) => console.error(`Could not load ${food.file}`, err))
    .finally(() => {
      if (++loaded === FOODS.length) loader.classList.add("is-done");
    });
});
 
/* ---------- Layout ---------- */
let offsetX = 0, offsetY = 0, sizeMul = 1;
 
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
 
  const wide = w > 820;
  offsetX = wide ? 2.1 : 0;
  offsetY = wide ? 0 : 1.1;
  sizeMul = wide ? 1 : 0.8;
}
window.addEventListener("resize", resize);
resize();
 
/* ---------- Scroll ---------- */
let target = 0, current = 0;
 
function readScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  target = max > 0 ? window.scrollY / max : 0;
}
window.addEventListener("scroll", readScroll, { passive: true });
readScroll();
 
navBtns.forEach((btn) =>
  btn.addEventListener("click", () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = Number(btn.dataset.go) / (FOODS.length - 1);
    window.scrollTo({ top: p * max, behavior: "smooth" });
  })
);
 
/* ---------- Helpers ---------- */
const clamp = THREE.MathUtils.clamp;
const smooth = (x) => x * x * (3 - 2 * x);
const bgColor = new THREE.Color();
 
/* ---------- Animation loop ---------- */
function frame(time) {
  current += (target - current) * 0.08; // eased scroll
  const t = current * (FOODS.length - 1); // 0 → 2
 
  rigs.forEach((rig, i) => {
    const d = i - t;                                    // 0 when centred
    const a = Math.abs(d);
    const vis = smooth(clamp((0.5 - a) / 0.3, 0, 1));   // full when a<0.2, gone at 0.5
 
    rig.visible = vis > 0.001;
    rig.scale.setScalar(vis * sizeMul);
    rig.position.set(offsetX, offsetY - d * 3, 0);      // slides up out, rises in
    rig.rotation.y = -d * Math.PI * 3 + time * 0.0003;  // spins with scroll
 
    panels[i].style.opacity = vis;
    panels[i].style.transform = `translateY(${-d * 70}px)`;
  });
 
  // Background colour blends between foods around the midpoint
  const i0 = clamp(Math.floor(t), 0, FOODS.length - 2);
  const f = smooth(clamp((t - i0 - 0.25) / 0.5, 0, 1));
  bgColor.copy(BG[i0]).lerp(BG[i0 + 1], f);
  document.body.style.setProperty("--bg", `#${bgColor.getHexString()}`);
 
  const active = Math.round(t);
  navBtns.forEach((b, i) => b.classList.toggle("is-active", i === active));
 
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
 