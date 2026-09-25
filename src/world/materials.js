import * as THREE from 'three';
import {
  woodBoardTexture, tinRoofTexture, concreteTexture, floorBoardTexture, wallpaperTexture, tileTexture, logWallTexture,
} from '../core/textures.js';

let M = null;

export function materials() {
  if (M) return M;
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
  M = {
    faluRed: std({ map: woodBoardTexture('#8a2c20', 41), roughness: 0.92 }),
    greyBoards: std({ map: woodBoardTexture('#7a7266', 42), roughness: 0.95 }),
    yellowBoards: std({ map: woodBoardTexture('#c49a3e', 43), roughness: 0.92 }),
    whiteBoards: std({ map: woodBoardTexture('#dcd7c8', 44), roughness: 0.9 }),
    greenBoards: std({ map: woodBoardTexture('#4f6a4a', 45), roughness: 0.9 }),
    trim: std({ color: 0xe8e3d6, roughness: 0.7 }),
    roof: std({ map: tinRoofTexture('#2e3331'), roughness: 0.55, metalness: 0.35 }),
    roofRed: std({ map: tinRoofTexture('#6a2a22'), roughness: 0.6, metalness: 0.3 }),
    concrete: std({ map: concreteTexture(), roughness: 0.95 }),
    floor: std({ map: floorBoardTexture(), roughness: 0.8 }),
    wallpaper: std({ map: wallpaperTexture(), roughness: 0.9 }),
    tiles: std({ map: tileTexture(), roughness: 0.35 }),
    blueTiles: std({ map: tileTexture('#9fb8c4', '#6c7f88'), roughness: 0.35 }),
    logs: std({ map: logWallTexture(), roughness: 0.95 }),
    darkWood: std({ color: 0x4a3322, roughness: 0.8 }),
    wood: std({ color: 0x9a7048, roughness: 0.8 }),
    benchWood: std({ color: 0xc0925c, roughness: 0.75 }),
    stone: std({ color: 0x77746b, roughness: 1 }),
    metal: std({ color: 0x8b8f92, roughness: 0.45, metalness: 0.6 }),
    darkMetal: std({ color: 0x2e3032, roughness: 0.55, metalness: 0.5 }),
    chrome: std({ color: 0xd8dde0, roughness: 0.18, metalness: 1 }),
    rubber: std({ color: 0x161616, roughness: 0.92 }),
    white: std({ color: 0xeeeae2, roughness: 0.5 }),
    enamel: std({ color: 0xf2efe8, roughness: 0.25 }),
    cloth: std({ color: 0x4e6b8a, roughness: 1 }),
    blanket: std({ color: 0x8e3b2c, roughness: 1 }),
    fabric: std({ color: 0x7a6a4a, roughness: 1 }),
    glass: std({ color: 0x1c2a33, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.45, envMapIntensity: 1.5 }),
    black: std({ color: 0x111111, roughness: 0.6 }),
    orange: std({ color: 0xc4622d, roughness: 0.6 }),
    red: std({ color: 0xa3261e, roughness: 0.5 }),
    yellow: std({ color: 0xd9a441, roughness: 0.6 }),
    green: std({ color: 0x3f5f3a, roughness: 0.7 }),
    hay: std({ color: 0xf1efe6, roughness: 0.5 }),
    skin: std({ color: 0xd9a383, roughness: 0.8 }),
    lampOn: new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffd89a, emissiveIntensity: 2 }),
  };
  return M;
}

// Window glass that glows warm when a building's lights are on.
export function windowMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x1b2730, roughness: 0.08, metalness: 0.2, emissive: 0xffc27a, emissiveIntensity: 0, transparent: true, opacity: 0.55 });
}
