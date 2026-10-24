// Keep image mapping and mount limits based on the same panorama dimensions.
export const PANORAMA_WIDTH = 6890,
  PANORAMA_HEIGHT = 1350,
  FOREGROUND_BASELINE = 1120,
  FOREGROUND_DISTANCE = 14;
export const PANORAMA_VERTICAL_SPAN = (PANORAMA_HEIGHT / PANORAMA_WIDTH) * 360;
export const FOREGROUND_BOTTOM_ALTITUDE =
  ((FOREGROUND_BASELINE - PANORAMA_HEIGHT) / PANORAMA_WIDTH) * 360;

// The lower circular rim is half a vertical FOV below the optical axis.
// Intersect its azimuth with the foreground's bottom latitude, including the
// same observer offset used by the parallax shader. The ground extension below
// the image is deliberately excluded from the usable viewing area.
export function minimumWideAltitude(
  fov: number,
  azimuth = 0,
  observer: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
) {
  const radians = Math.PI / 180,
    latitude = FOREGROUND_BOTTOM_ALTITUDE * radians;
  const radius = FOREGROUND_DISTANCE * Math.cos(latitude),
    az = azimuth * radians;
  const along = observer.x * Math.sin(az) - observer.z * Math.cos(az);
  const horizontal =
    -along +
    Math.sqrt(
      Math.max(
        0,
        along * along + radius * radius - observer.x * observer.x - observer.z * observer.z,
      ),
    );
  const bottom =
    Math.atan2(FOREGROUND_DISTANCE * Math.sin(latitude) - observer.y, horizontal) / radians;
  return bottom + fov / 2;
}
