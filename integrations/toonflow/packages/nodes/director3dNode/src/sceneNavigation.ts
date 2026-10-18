import { Euler, MathUtils, Vector3, type Camera } from "three";

/** Scene navigation stays inside the canvas and does not require browser pointer lock. */
export function createSceneNavigation(camera: Camera) {
  const rotation = new Euler(0, 0, 0, "YXZ"), movement = new Vector3(), right = new Vector3(), forward = new Vector3();
  return {
    look(deltaX: number, deltaY: number) {
      rotation.setFromQuaternion(camera.quaternion);
      rotation.y -= deltaX * 0.002;
      rotation.x = MathUtils.clamp(rotation.x - deltaY * 0.002, -Math.PI / 2, Math.PI / 2);
      camera.quaternion.setFromEuler(rotation);
    },
    move(x: number, y: number, z: number, elapsed: number) {
      movement.set(x, y, z).normalize().multiplyScalar(Math.min(Math.max(elapsed, 0), 0.05) * 8);
      camera.updateMatrixWorld();
      right.setFromMatrixColumn(camera.matrix, 0);
      forward.crossVectors(camera.up, right);
      camera.position.addScaledVector(right, movement.x).addScaledVector(forward, movement.z);
      camera.position.y += movement.y;
    },
  };
}
