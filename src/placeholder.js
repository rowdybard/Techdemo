// Stand-in scene for the skeleton: flat sand and sea, a 10 m grid on the sand, and a
// barge with a pulsing beacon where the shells will launch. The sky, ocean and beach
// modules replace it; delete this file once they exist.
import * as THREE from 'three';

export function create({ scene, config }) {
  const dusk = new THREE.Color(0x1d2542);
  scene.background = dusk;
  scene.fog = new THREE.Fog(dusk, 200, 2600);

  const group = new THREE.Group();
  const disposables = [];

  function add(object, x, y, z) {
    object.position.set(x, y, z);
    group.add(object);
    disposables.push(object.geometry, object.material);
    return object;
  }

  const flat = (width, depth) => new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2);
  add(new THREE.Mesh(flat(600, 300), new THREE.MeshBasicMaterial({ color: 0x6e5d4b })), 0, 0, 150);
  add(new THREE.Mesh(flat(6000, 3000), new THREE.MeshBasicMaterial({ color: 0x16243b })), 0, 0, -1500);
  add(new THREE.GridHelper(200, 20, 0x9a8770, 0x857461), 0, 0.02, 100);

  const [bx, by, bz] = config.show.bargePosition;
  add(new THREE.Mesh(new THREE.BoxGeometry(36, 3, 12), new THREE.MeshBasicMaterial({ color: 0x0b0e16 })), bx, by + 1.5, bz);
  const beaconMaterial = new THREE.MeshBasicMaterial({ fog: false });
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
      scene.background = null;
      scene.fog = null;
    },
  };
}
