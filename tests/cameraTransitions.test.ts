import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  CAMERA_NUDGE_MOTION_EASE,
  CAMERA_PRESET_MOTION_EASE,
  computeCameraPresetPose,
  interpolateSphericalCameraPose,
} from '../src/kernel/cameraTransitions';
import type { CameraPreset } from '../src/types/cad';

describe('cameraTransitions (Framer Motion 3D spherical navigation, 100% Coverage)', () => {
  it('computes deterministic world-space poses for all 8 CameraPreset views', () => {
    const center = new THREE.Vector3(10, 20, 30);
    const size = new THREE.Vector3(200, 100, 120);
    const presets: CameraPreset[] = [
      'perspective',
      'isometric',
      'top',
      'bottom',
      'front',
      'back',
      'left',
      'right',
    ];

    for (const preset of presets) {
      const pose = computeCameraPresetPose(preset, center, size);
      expect(pose.target.x).toBe(10);
      expect(pose.target.y).toBe(20);
      expect(pose.target.z).toBe(30);
      expect(pose.position.distanceTo(center)).toBeGreaterThan(180);
    }

    expect(computeCameraPresetPose('top', center, size).position.y).toBeGreaterThan(center.y);
    expect(computeCameraPresetPose('bottom', center, size).position.y).toBeLessThan(center.y);
    expect(computeCameraPresetPose('front', center, size).position.z).toBeGreaterThan(center.z);
    expect(computeCameraPresetPose('back', center, size).position.z).toBeLessThan(center.z);
    expect(computeCameraPresetPose('right', center, size).position.x).toBeGreaterThan(center.x);
    expect(computeCameraPresetPose('left', center, size).position.x).toBeLessThan(center.x);

    expect(CAMERA_PRESET_MOTION_EASE.durationSec).toBeGreaterThan(0.4);
    expect(CAMERA_NUDGE_MOTION_EASE.durationSec).toBeGreaterThan(0.1);
  });

  it('orbits smoothly around target along shortest spherical arc instead of clipping center', () => {
    const target = new THREE.Vector3(0, 30, 0);
    const size = new THREE.Vector3(200, 100, 150);
    const front = computeCameraPresetPose('front', target, size);
    const back = computeCameraPresetPose('back', target, size);

    // Midpoint (t = 0.5) must stay at orbital distance (~radius), NOT near center!
    const mid = interpolateSphericalCameraPose(front, back, 0.5);
    const midRadius = mid.position.distanceTo(target);
    const frontRadius = front.position.distanceTo(target);
    expect(midRadius).toBeCloseTo(frontRadius, 2);
    expect(midRadius).toBeGreaterThan(200);

    // Clamps out-of-range t safely to [0, 1]
    const clampedStart = interpolateSphericalCameraPose(front, back, -0.5);
    expect(clampedStart.position.distanceTo(front.position)).toBeLessThan(1e-4);

    const clampedEnd = interpolateSphericalCameraPose(front, back, 1.5);
    expect(clampedEnd.position.distanceTo(back.position)).toBeLessThan(1e-4);
  });

  it('handles degenerate zero-radius camera offsets gracefully without NaN', () => {
    const start = {
      position: new THREE.Vector3(5, 5, 5),
      target: new THREE.Vector3(5, 5, 5),
    };
    const end = {
      position: new THREE.Vector3(105, 5, 5),
      target: new THREE.Vector3(5, 5, 5),
    };

    const mid = interpolateSphericalCameraPose(start, end, 0.5);
    expect(Number.isFinite(mid.position.x)).toBe(true);
    expect(mid.position.x).toBeCloseTo(55, 5);
  });
});
