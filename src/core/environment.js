import * as THREE from 'three';

/**
 * Procedurální "studio" prostředí pro odlesky na kovových materiálech.
 * Záměrně staví jen na jádru three.js (žádný RoomEnvironment addon ani HDR soubor),
 * takže se nemá co rozbít při změně verze a nic se nestahuje navíc.
 */
export function createStudioEnvironment(renderer, options = {}) {
  const { intensity = 1 } = options;

  const room = new THREE.Scene();
  room.background = new THREE.Color(0x0b0e14);

  const geometry = new THREE.PlaneGeometry(1, 1);
  const disposables = [geometry];

  const panel = (color, power, size, position, lookAt) => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(power * intensity),
      side: THREE.DoubleSide,
    });
    disposables.push(material);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(size[0], size[1], 1);
    mesh.position.set(...position);
    mesh.lookAt(...(lookAt ?? [0, 0, 0]));
    room.add(mesh);
    return mesh;
  };

  // hlavní key light shora, studený fill zleva, teplý rim zezadu
  panel(0xffffff, 3.2, [9, 9], [0, 7, 1], [0, 0, 0]);
  panel(0x9dc4ff, 1.4, [7, 5], [-6, 2, 3], [0, 1, 0]);
  panel(0xff8a52, 1.1, [6, 4], [4.5, 1.5, -6], [0, 1, 0]);
  panel(0x1a2330, 0.6, [16, 16], [0, -4, 0], [0, 1, 0]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(room, 0.035);
  pmrem.dispose();

  for (const item of disposables) item.dispose();
  room.clear();

  return target.texture;
}
