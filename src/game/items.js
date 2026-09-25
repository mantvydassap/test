import * as THREE from 'three';
import { boxGeo, mergeObject } from '../core/geo.js';
import { labelTexture } from '../core/textures.js';
import { materials } from '../world/materials.js';

// Everything the player can buy, carry, eat or pour.
export const ITEMS = {
  sausage: { name: 'Sausages', label: 'MAKKARA', color: '#b3362b', price: 8.5, mass: 0.5, shape: 'pack', size: [0.26, 0.06, 0.12], use: { verb: 'Eat', hunger: -34, thirst: 6, stress: -4 } },
  pizza: { name: 'Frozen pizza', label: 'PIZZA', color: '#c4622d', price: 12.9, mass: 0.45, shape: 'flatbox', size: [0.3, 0.045, 0.3], use: { verb: 'Eat', hunger: -52, thirst: 8, stress: -6 } },
  bread: { name: 'Rye bread', label: 'RUIS', color: '#6b4a2e', price: 4.2, mass: 0.5, shape: 'loaf', size: [0.24, 0.08, 0.12], use: { verb: 'Eat', hunger: -26, thirst: 5 } },
  milk: { name: 'Milk 1 L', label: 'MAITO', color: '#2d5fa8', price: 3.9, mass: 1.05, shape: 'carton', size: [0.08, 0.2, 0.08], use: { verb: 'Drink', thirst: -34, hunger: -10, urine: 8 } },
  juice: { name: 'Berry juice', label: 'MEHU', color: '#8c2254', price: 4.9, mass: 1.05, shape: 'carton', size: [0.08, 0.2, 0.08], use: { verb: 'Drink', thirst: -46, urine: 10, stress: -2 } },
  beer: { name: 'Beer', label: 'OLUT', color: '#b08a2a', price: 3.2, mass: 0.6, shape: 'bottle', size: [0.035, 0.12, 0.035], use: { verb: 'Drink', thirst: -18, stress: -12, drunk: 0.18, urine: 14, leaves: 'bottle' } },
  coffee: { name: 'Coffee 500 g', label: 'KAHVI', color: '#5a2c1c', price: 9.8, mass: 0.5, shape: 'pack', size: [0.12, 0.16, 0.08], portions: 10, desc: 'Brew it with the coffee maker at home.' },
  sparkplugs: { name: 'Spark plugs, box of 4', label: 'TULPAT', color: '#1f4f8a', price: 34, mass: 0.3, shape: 'box', size: [0.16, 0.06, 0.1], opens: { item: 'part:plug', count: 4 } },
  oil: { name: 'Motor oil 4 L', label: 'ÖLJY', color: '#c79a24', price: 29, mass: 3.8, shape: 'jug', size: [0.1, 0.16, 0.18], liquid: 'oil', amount: 4 },
  coolant: { name: 'Coolant 4 L', label: 'JÄÄHDYTIN', color: '#3b8a4a', price: 18, mass: 4.1, shape: 'jug', size: [0.1, 0.16, 0.18], liquid: 'coolant', amount: 4 },
  jerrycan: { name: 'Jerry can 20 L', label: '', color: '#a3261e', price: 24, mass: 1.6, shape: 'jerry', size: [0.09, 0.23, 0.18], liquid: 'fuel', amount: 0, capacity: 20 },
  rebuildkit: { name: 'Engine rebuild kit', label: 'REMONTTI', color: '#3a3a3a', price: 380, mass: 4, shape: 'box', size: [0.3, 0.14, 0.22], desc: 'Hold it next to a worn engine block and press E.' },
  bottle: { name: 'Empty bottle', label: 'OLUT', color: '#6a5a2a', price: 0, mass: 0.35, shape: 'bottle', size: [0.035, 0.12, 0.035], deposit: 0.4 },
  bag: { name: 'Shopping bag', label: '', color: '#d8c7a0', price: 0, mass: 1, shape: 'bag', size: [0.18, 0.2, 0.12] },
};

export const SHOP_STOCK = ['sausage', 'pizza', 'bread', 'milk', 'juice', 'beer', 'coffee', 'sparkplugs', 'oil', 'coolant', 'jerrycan', 'rebuildkit'];

const matCache = new Map();
function labelMat(def) {
  const key = def.label + def.color;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ map: labelTexture(def.label || ' ', def.color), roughness: 0.6 }));
  }
  return matCache.get(key);
}
function colorMat(c, rough = 0.6, metal = 0) {
  const key = 'c' + c + rough + metal;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }));
  return matCache.get(key);
}

// Builds the visible mesh of an item. Returns a Group whose origin is the centre of its bounding box.
export function makeItemMesh(type) {
  const def = ITEMS[type];
  const g = new THREE.Group();
  const [hx, hy, hz] = def.size;
  const M = materials();
  const L = labelMat(def);
  const plain = colorMat(def.color);
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  switch (def.shape) {
    case 'pack': case 'box': case 'flatbox': {
      // label on the large faces
      const mats = hy < Math.max(hx, hz) * 0.6
        ? [plain, plain, L, plain, plain, plain]
        : [plain, plain, plain, plain, L, L];
      add(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), mats);
      break;
    }
    case 'loaf': {
      const geo = new THREE.CapsuleGeometry(hy, hx * 2 - hy * 2, 4, 8);
      geo.rotateZ(Math.PI / 2); geo.scale(1, 1, hz / hy);
      add(geo, colorMat('#5a3a22', 0.95));
      break;
    }
    case 'carton': {
      add(new THREE.BoxGeometry(hx * 2, hy * 1.6, hz * 2), [plain, plain, plain, plain, L, L], 0, -hy * 0.2, 0);
      const roof = new THREE.CylinderGeometry(0, hx * 1.42, hy * 0.4, 4, 1);
      roof.rotateY(Math.PI / 4);
      add(roof, colorMat('#efe9da'), 0, hy * 0.8, 0);
      break;
    }
    case 'bottle': {
      const glass = colorMat(type === 'bottle' ? '#5b4a1f' : '#6b4f14', 0.15, 0.1);
      add(new THREE.CylinderGeometry(hx, hx, hy * 1.2, 10), glass, 0, -hy * 0.4, 0);
      add(new THREE.CylinderGeometry(hx * 0.4, hx, hy * 0.35, 10), glass, 0, hy * 0.38, 0);
      add(new THREE.CylinderGeometry(hx * 0.36, hx * 0.36, hy * 0.28, 8), glass, 0, hy * 0.72, 0);
      if (type === 'beer') {
        add(new THREE.CylinderGeometry(hx * 1.02, hx * 1.02, hy * 0.5, 10, 1, true), L, 0, -hy * 0.35, 0);
        add(new THREE.CylinderGeometry(hx * 0.42, hx * 0.42, 0.01, 8), colorMat('#c8b24a', 0.3, 0.8), 0, hy * 0.87, 0);
      }
      break;
    }
    case 'jug': {
      add(new THREE.BoxGeometry(hx * 2, hy * 1.7, hz * 2), [plain, plain, plain, plain, L, L], 0, -hy * 0.15, 0);
      add(new THREE.CylinderGeometry(0.025, 0.025, hy * 0.35, 8), colorMat('#222'), 0, hy * 0.83, -hz * 0.5);
      add(new THREE.BoxGeometry(0.03, 0.04, hz * 1.0), plain, 0, hy * 0.75, hz * 0.3);
      break;
    }
    case 'jerry': {
      add(new THREE.BoxGeometry(hx * 2, hy * 1.75, hz * 2), plain, 0, -hy * 0.12, 0);
      add(new THREE.BoxGeometry(hx * 1.2, 0.03, hz * 1.2), plain, 0, hy * 0.82, 0.02);
      add(new THREE.CylinderGeometry(0.02, 0.025, 0.07, 8), colorMat('#333'), 0, hy * 0.85, -hz * 0.75);
      for (const x of [-hx * 0.5, hx * 0.5]) add(new THREE.BoxGeometry(0.01, hy * 1.4, hz * 1.4), colorMat('#8a1d17'), x + Math.sign(x) * (hx * 0.52), -hy * 0.12, 0);
      break;
    }
    case 'bag': {
      add(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), colorMat('#cdb88c', 0.95));
      add(new THREE.BoxGeometry(hx * 2.02, hy * 0.25, hz * 2.02), colorMat('#b89e6c', 0.95), 0, hy * 0.87, 0);
      add(new THREE.BoxGeometry(hx * 1.2, 0.02, 0.02), colorMat('#8a3b20'), 0, hy * 1.1, 0);
      break;
    }
    default:
      add(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), plain);
  }
  return mergeObject(g);
}

export function itemDisplayName(prop) {
  const def = ITEMS[prop.type];
  if (!def) return prop.type;
  if (def.liquid) {
    const amt = prop.data.amount ?? def.amount;
    return `${def.name.replace(/ \d+ L$/, '')} (${amt.toFixed(1)} L)`;
  }
  if (def.portions) return `${def.name} (${prop.data.portions ?? def.portions} cups left)`;
  if (prop.type === 'bag') return `Shopping bag (${(prop.data.contents || []).length} items)`;
  return def.name;
}
