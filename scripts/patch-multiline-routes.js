const path = require('path');
const { fetch, readFile, writeFile } = require('../utils');

const services = readFile('./data/v1/raw/bus-services.json');

const multilineGeoJSONs = [];

services.forEach((service) => {
  const { number, type, kmlFile } = service;
  if (/^-/.test(number) || !/^(CITYDIRECT|TRUNK)$/.test(type)) return;

  kmlFile.forEach((fileName) => {
    try {
      const numberPattern = path.parse(fileName).name;
      const geojson = readFile(
        `data/v1/raw/services/${type}/${numberPattern}.geojson`,
      );
      const { features } = geojson;
      if (features.length > 1) {
        multilineGeoJSONs.push({
          number,
          numberPattern,
          e: 'More than 1 feature',
          count: features.length,
        });
        return;
      }
      const { geometry } = features[0];
      if (geometry.type !== 'LineString') {
        multilineGeoJSONs.push({
          number,
          numberPattern,
          e: `Not LineString but is ${geometry.type}`,
          count:
            geometry.type === 'GeometryCollection'
              ? geometry.geometries.length
              : '?',
        });
        return;
      }
    } catch (e) {}
  });
});

console.table(multilineGeoJSONs);
writeFile(
  'data/v1/patch/patch-multiple-routes.results.json',
  multilineGeoJSONs,
);

(async () => {
  for (let i = 0; i < multilineGeoJSONs.length; i++) {
    const multilineGeoJSON = multilineGeoJSONs[i];
    const { number } = multilineGeoJSON;
    const {
      results,
    } = await fetch(
      `https://citymapper.com/api/2/findtransport?query=${number}&region_id=sg-singapore`,
      { json: true },
    );
    if (results?.length) {
      const firstResult = results.find((r) => r.display_name == number);
      const routeInfo = await fetch(
        `https://citymapper.com/api/1/routeinfo?route=${firstResult.id}&region_id=sg-singapore&weekend=1&status_format=rich`,
        { json: true },
      );
      if (routeInfo.routes.length) {
        writeFile(`data/v1/patch/${number}.cm.json`, routeInfo);
      }
    }

    // Wait a second
    await new Promise((res) => setTimeout(res, 1000));
  }
})();
