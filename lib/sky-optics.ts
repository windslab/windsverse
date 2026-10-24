export type SkyOptics = {
  wide?: boolean;
  wideFov?: number;
  telescopeFocalLength: number;
  eyepiece: number;
  barlow: number;
  barrel: 31.7 | 50.8;
  apparentFov: number;
};
export const DEFAULT_OPTICS: SkyOptics = {
  telescopeFocalLength: 1500,
  eyepiece: 32,
  barlow: 1,
  barrel: 31.7,
  apparentFov: 50,
};
export const magnification = (optics: SkyOptics) =>
  optics.wide ? 1 : (optics.telescopeFocalLength / optics.eyepiece) * optics.barlow;
export const WIDE_FOV = 87.5;
export const MIN_WIDE_FOV = 15,
  MAX_WIDE_FOV = WIDE_FOV;
export const clampWideFov = (fov: number) => Math.max(MIN_WIDE_FOV, Math.min(MAX_WIDE_FOV, fov));
export const fieldOfView = (optics: SkyOptics) =>
  optics.wide
    ? clampWideFov(optics.wideFov ?? WIDE_FOV)
    : optics.apparentFov / magnification(optics);
export type SkyObjectOption = { id: string; name: string; kind: string; aliases: string[] };

export const focusBlur = (focus: number) => Math.pow(Math.abs(focus) / 100, 1.6) * 3;

export const MIN_MOUNT_ALT = 33.641,
  MAX_MOUNT_ALT = 89.999;
export const clampMountAltitude = (altitude: number, minimum = MIN_MOUNT_ALT) =>
  Math.max(minimum, Math.min(MAX_MOUNT_ALT, altitude));
