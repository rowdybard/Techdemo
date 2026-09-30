// Stand-in scene: plain sand shaped by the terrain, and a barge with a pulsing beacon
// where the shells will launch. The beach and fireworks modules replace it; delete this
// file once they exist.
import * as THREE from 'three';
import { terrainHeight } from './terrain.glsl.js';

export function create({ scene, config }) {
  const group = new THREE.Group();
  const disposables = [];

  function add(object, x, y, z) {
    object.position.set(x, y, z);
    group.add(object);
    disposables.push(object.geometry, object.material);
    return object;
  }

  const sand = new THREE.PlaneGeometry(600, 300, 300, 150).rotateX(-Math.PI / 2).translate(0, 0, 110);
  const points = sand.attributes.position;
  for (let i = 0; i < points.count; i++) points.setY(i, terrainHeight(points.getX(i), points.getZ(i)));
  add(new THREE.Mesh(sand, new THREE.MeshBasicMaterial({ color: 0x2c241f })), 0, 0, 0);

  const [bx, by, bz] = config.show.bargePosition;
  add(new THREE.Mesh(new THREE.BoxGeometry(36, 3, 12), new THREE.MeshBasicMaterial({ color: 0x0b0e16 })), bx, by + 1.5, bz);
  const beaconMaterial = new THREE.MeshBasicMaterial();
  add(new THREE.Mesh(new THREE.SphereGeometry(2.5, 16, 8), beaconMaterial), bx, by + 6, bz);

  scene.add(group);

  return {
    update(dt, time) {
      // Pulses on simulation time, so it freezes while the tab is hidden.
      const pulse = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(time * 3));
      beaconMaterial.color.setRGB(pulse, pulse * 0.55, pulse * 0.2);
    },

    dispose() {
      scene.remove(group);
      for (const item of disposables) item.dispose();
    },
  };
}
