// Stand-in barge with a pulsing beacon where the shells will launch. The fireworks
// module replaces it; delete this file once it exists.
import * as THREE from 'three';

export function create({ scene, config }) {
  const group = new THREE.Group();
  const disposables = [];

  function add(object, x, y, z) {
    object.position.set(x, y, z);
    group.add(object);
    disposables.push(object.geometry, object.material);
    return object;
  }


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
