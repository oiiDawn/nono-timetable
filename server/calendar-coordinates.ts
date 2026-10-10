/** Convert stored mainland Gaode coordinates to WGS-84 for calendar geo URIs. */

function offset(longitude: number, latitude: number): [number, number] {
  const x = longitude - 105;
  const y = latitude - 35;
  const pi = Math.PI;
  const wave = (value: number, a: number, b: number, c: number, d: number) =>
    ((a * Math.sin((value * pi) / b) + c * Math.sin((value * pi) / d)) * 2) / 3;
  const shared = wave(x, 20, 1 / 6, 20, 1 / 2);
  const north =
    -100 +
    2 * x +
    3 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x)) +
    shared +
    wave(y, 20, 1, 40, 3) +
    wave(y, 160, 12, 320, 30);
  const east =
    300 +
    x +
    2 * y +
    0.1 * x * x +
    0.1 * x * y +
    0.1 * Math.sqrt(Math.abs(x)) +
    shared +
    wave(x, 20, 1, 40, 3) +
    wave(x, 150, 12, 300, 30);
  const radians = (latitude * pi) / 180;
  const eccentricity = 0.00669342162296594323;
  const magic = 1 - eccentricity * Math.sin(radians) ** 2;
  return [
    (east * 180) / ((6378245 / Math.sqrt(magic)) * Math.cos(radians) * pi),
    (north * 180) / (((6378245 * (1 - eccentricity)) / (magic * Math.sqrt(magic))) * pi),
  ];
}

/** Iteratively invert the GCJ offset; six decimals match the validated calendar format. */
export function calendarCoordinates(longitude: number, latitude: number): [string, string] {
  let lon = longitude;
  let lat = latitude;
  if (longitude > 73.66 && longitude < 135.05 && latitude > 3.86 && latitude < 53.55) {
    for (let iteration = 0; iteration < 5; iteration++) {
      const [east, north] = offset(lon, lat);
      lon = longitude - east;
      lat = latitude - north;
    }
  }
  return [lon.toFixed(6), lat.toFixed(6)];
}
