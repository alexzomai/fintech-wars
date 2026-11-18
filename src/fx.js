import * as THREE from 'three';

// Короткоживущие эффекты: трассеры, вспышки, взрыв гранаты «Дефолт».
export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  tracer(from, to, color = 0xfff2a0) {
    const g = new THREE.BufferGeometry().setFromPoints([from, to]);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(g, m);
    this.scene.add(line);
    this.items.push({ obj: line, t: 0, life: 0.09, fade: true });
  }

  spark(at, color = 0xffd27a, size = 0.35) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 6, 4), new THREE.MeshBasicMaterial({ color, transparent: true }));
    mesh.position.copy(at);
    this.scene.add(mesh);
    this.items.push({ obj: mesh, t: 0, life: 0.15, fade: true, grow: 2 });
  }

  // Взрыв-купол: растущая полупрозрачная сфера.
  blast(at, radius, color = 0x7ad7ff) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false }));
    mesh.position.copy(at);
    this.scene.add(mesh);
    this.items.push({ obj: mesh, t: 0, life: 0.7, fade: true, blastR: radius });
  }

  update(dt) {
    this.items = this.items.filter((it) => {
      it.t += dt;
      const k = it.t / it.life;
      if (k >= 1) {
        this.scene.remove(it.obj);
        it.obj.geometry.dispose();
        it.obj.material.dispose();
        return false;
      }
      if (it.fade) it.obj.material.opacity = (it.blastR ? 0.5 : 0.9) * (1 - k);
      if (it.grow) it.obj.scale.setScalar(1 + k * it.grow);
      if (it.blastR) it.obj.scale.setScalar(Math.min(1, k * 3) * it.blastR);
      return true;
    });
  }
}
