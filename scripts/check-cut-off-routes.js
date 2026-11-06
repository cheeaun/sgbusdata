const fs = require('fs');
const path = require('path');
const { writeFile } = require('../utils');
const {
  CUT_OFF_PERCENTAGE,
  geometryDistanceMeters,
  stopDistanceMeters,
} = require('./lib/route-distance');

const readJson = (fileName) =>
  JSON.parse(fs.readFileSync(fileName, 'utf8'));
const services = readJson('./data/v1/raw/bus-services.json');
const stops = readJson('./data/v1/raw/bus-stops.json');
const stopCoordinates = new Map(
  stops.map((stop) => [
    String(stop.name),
    [stop.coordinates.long, stop.coordinates.lat],
  ]),
);

const cutOffRoutes = [];

services.forEach(({ number, type, kmlFile }) => {
  if (/^-/.test(number) || !/^(CITYDIRECT|TRUNK)$/.test(type)) return;

  const serviceNumber = String(number);
  const routeFile = `data/v1/raw/services/${type}/${serviceNumber}.json`;
  if (!fs.existsSync(routeFile)) {
    console.warn(`Skipping ${serviceNumber}: missing ${routeFile}`);
    return;
  }
  const routePatterns = readJson(routeFile);

  kmlFile.forEach((fileName, index) => {
    const patternName = path.parse(fileName).name;
    const geometryFile = `data/v1/raw/services/${type}/${patternName}.geojson`;
    const routePattern = routePatterns[index];
    if (!routePattern?.stops?.length) {
      console.warn(`Skipping ${patternName}: missing route stop pattern`);
      return;
    }
    if (!fs.existsSync(geometryFile)) {
      console.warn(`Skipping ${patternName}: missing ${geometryFile}`);
      return;
    }

    const expectedDistance = stopDistanceMeters(
      routePattern.stops,
      stopCoordinates,
    );
    if (expectedDistance === null) {
      console.warn(`Skipping ${patternName}: one or more stops have no coordinates`);
      return;
    }

    const actualDistance = geometryDistanceMeters(readJson(geometryFile));
    if (expectedDistance === 0 || actualDistance === 0) {
      console.warn(`Skipping ${patternName}: route or stop distance is zero`);
      return;
    }

    const percentage = (actualDistance / expectedDistance) * 100;
    if (percentage < CUT_OFF_PERCENTAGE) {
      cutOffRoutes.push({
        number: serviceNumber,
        numberPattern: patternName,
        name: routePattern.name,
        stopCount: routePattern.stops.length,
        actualDistanceMeters: Math.round(actualDistance),
        straightLineDistanceMeters: Math.round(expectedDistance),
        percentage: Number(percentage.toFixed(1)),
      });
    }
  });
});

cutOffRoutes.sort((a, b) => a.percentage - b.percentage);
console.table(cutOffRoutes);
writeFile('./data/v1/patch/bus-services-routes.cut-off.json', cutOffRoutes);
console.log(
  `Found ${cutOffRoutes.length} potentially cut-off route pattern(s) (actual / straight-line < ${CUT_OFF_PERCENTAGE}%).`,
);
