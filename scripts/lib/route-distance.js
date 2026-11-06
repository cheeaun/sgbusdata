const EARTH_RADIUS_METERS = 6371008.8;
const CUT_OFF_PERCENTAGE = 90;

const distanceMeters = ([longitude1, latitude1], [longitude2, latitude2]) => {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(latitude2 - latitude1);
  const longitudeDelta = toRadians(longitude2 - longitude1);
  const latitude1Radians = toRadians(latitude1);
  const latitude2Radians = toRadians(latitude2);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1Radians) *
      Math.cos(latitude2Radians) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getLineStrings = (geometry) => {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  if (geometry.type === 'GeometryCollection') {
    return geometry.geometries.flatMap(getLineStrings);
  }
  return [];
};

const lineDistanceMeters = (lines) =>
  lines.reduce(
    (total, line) =>
      total +
      line.slice(1).reduce(
        (lineTotal, coordinate, index) =>
          lineTotal + distanceMeters(line[index], coordinate),
        0,
      ),
    0,
  );

const geometryDistanceMeters = (geojson) =>
  lineDistanceMeters(
    geojson.features.flatMap((feature) => getLineStrings(feature.geometry)),
  );

const stopDistanceMeters = (routeStops, stopCoordinates) => {
  let total = 0;
  for (let index = 1; index < routeStops.length; index++) {
    const previousStop = stopCoordinates.get(String(routeStops[index - 1]));
    const currentStop = stopCoordinates.get(String(routeStops[index]));
    if (!previousStop || !currentStop) return null;
    total += distanceMeters(previousStop, currentStop);
  }
  return total;
};

module.exports = {
  CUT_OFF_PERCENTAGE,
  distanceMeters,
  geometryDistanceMeters,
  lineDistanceMeters,
  stopDistanceMeters,
};
