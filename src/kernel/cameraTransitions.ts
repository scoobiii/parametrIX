import * as THREE from 'three';
import type { CameraPreset } from '../types/cad';

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export interface CameraTransitionEasing {
  durationSec: number;
  ease: [number, number, number, number];
}

export const CAMERA_PRESET_MOTION_EASE: CameraTransitionEasing = {
  durationSec: 0.72,
  ease: [0.22, 1, 0.36, 1],
};

export const CAMERA_NUDGE_MOTION_EASE: CameraTransitionEasing = {
  durationSec: 0.32,
  ease: [0.22, 1, 0.36, 1],
};

/**
 * Computes deterministic world-space camera position and look-at target
 * for any CameraPreset around the active CAD bounding box.
 */
export function computeCameraPresetPose(
  preset: CameraPreset,
  center: THREE.Vector3,
  size: THREE.Vector3
): CameraPose {
  const dist = Math.max(180, size.length() * 1.45);
  const look = center.clone();

  const offsets: Record<CameraPreset, [number, number, number]> = {
    perspective: [dist * 0.65, dist * 0.48, dist * 0.78],
    isometric: [dist * 0.68, dist * 0.62, dist * 0.68],
    top: [0, dist * 1.15, 0.01],
    bottom: [0, -dist * 1.15, 0.01],
    front: [0, dist * 0.04, dist * 1.15],
    back: [0, dist * 0.04, -dist * 1.15],
    left: [-dist * 1.15, dist * 0.04, 0],
    right: [dist * 1.15, dist * 0.04, 0],
  };

  const [dx, dy, dz] = offsets[preset];
  return {
    position: new THREE.Vector3(center.x + dx, center.y + dy, center.z + dz),
    target: look,
  };
}

/**
 * Computes an interpolated orbital camera pose along a shortest-angle spherical arc
 * so preset switches (e.g. front -> back, left -> right, top -> isometric) glide
 * smoothly around the 3D CAD assembly instead of clipping through its center.
 */
export function interpolateSphericalCameraPose(
  start: CameraPose,
  end: CameraPose,
  t: number
): CameraPose {
  const clampedT = Math.max(0, Math.min(1, t));
  const target = new THREE.Vector3().lerpVectors(start.target, end.target, clampedT);

  const startOffset = start.position.clone().sub(start.target);
  const endOffset = end.position.clone().sub(end.target);
  const startRadius = startOffset.length();
  const endRadius = endOffset.length();

  if (startRadius < 1e-4 || endRadius < 1e-4) {
    return {
      position: new THREE.Vector3().lerpVectors(start.position, end.position, clampedT),
      target,
    };
  }

  const startSph = new THREE.Spherical().setFromVector3(startOffset);
  const endSph = new THREE.Spherical().setFromVector3(endOffset);

  const deltaTheta = Math.atan2(
    Math.sin(endSph.theta - startSph.theta),
    Math.cos(endSph.theta - startSph.theta)
  );
  const phi = THREE.MathUtils.clamp(
    THREE.MathUtils.lerp(startSph.phi, endSph.phi, clampedT),
    0.04,
    Math.PI - 0.04
  );
  const theta = startSph.theta + deltaTheta * clampedT;
  const radius = THREE.MathUtils.lerp(startRadius, endRadius, clampedT);

  const offset = new THREE.Vector3().setFromSpherical(new THREE.Spherical(radius, phi, theta));
  return {
    position: target.clone().add(offset),
    target,
  };
}
