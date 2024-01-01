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

      // Check for multiple features
      const { features } = geojson;
      if (features.length > 1) {
        const allFeaturesSame = features.every(
          (f) =>
            f.geometry.coordinates.join() ===
            features[0].geometry.coordinates.join(),
        );
        console.log(`🤪 Service ${number} features are all the same 🤦‍♂️`);
        if (allFeaturesSame) return;
        multilineGeoJSONs.push({
          number,
          numberPattern,
          e: 'More than 1 feature',
          count: features.length,
        });
        return;
      }

      const { geometry } = features[0];

      // Check for multiple *connected* LineStrings
      if (
        geometry.type === 'GeometryCollection' &&
        geometry.geometries.every((g) => g.type === 'LineString')
      ) {
        const isConnected = geometry.geometries.every(
          (geometry, index, geometries) => {
            // Ignore last geometry - just return true
            return (
              index === geometries.length - 1 ||
              geometry.coordinates[geometry.coordinates.length - 1].join(
                ',',
              ) === geometries[index + 1].coordinates[0].join(',')
            );
          },
        );
        if (isConnected) {
          return;
        }
      }

      // For anything else, just reject them
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

// (async () => {
//   for (let i = 0; i < multilineGeoJSONs.length; i++) {
//     const multilineGeoJSON = multilineGeoJSONs[i];
//     const { number } = multilineGeoJSON;
//     const {
//       results,
//     } = await fetch(
//       `https://citymapper.com/api/2/findtransport?query=${number}&region_id=sg-singapore`,
//       { json: true },
//     );
//     if (results?.length) {
//       const firstResult = results.find((r) => r.display_name == number);
//       const routeInfo = await fetch(
//         `https://citymapper.com/api/1/routeinfo?route=${firstResult.id}&region_id=sg-singapore&weekend=1&status_format=rich`,
//         { json: true },
//       );
//       if (routeInfo.routes.length) {
//         writeFile(`data/v1/patch/${number}.cm.json`, routeInfo);
//       }
//     }

//     // Wait a second
//     await new Promise((res) => setTimeout(res, 1000));
//   }
// })();

(async () => {
  const res = await fetch('https://www.onemap.gov.sg/', {
    returnResponse: true,
  });
  const cookie = res.headers['set-cookie'][0]; // string
  const token = cookie.match(/OMITN=(.*?);/)[1];

  const multilineServices = [
    ...new Set(multilineGeoJSONs.map((g) => '' + g.number)),
  ];
  for (let i = 0; i < multilineServices.length; i++) {
    const number = multilineServices[i];
    // const directions = await fetch(
    //   `https://developers.onemap.sg/publicapi/busexp/getBusRoutes?busNo=${number}&token=${access_token}`,
    //   { json: true },
    // );
    const direction1 = await fetch(
      `https://www.onemap.gov.sg/omapp/getBusRoutes?busSvcNo=${number}`,
      { json: true, headers: { Cookie: `OMITN=${token}` } },
    );
    let direction2 = null;
    if (direction1.length) {
      const END_BUS_STOP_NUM = direction1[0].END_BUS_STOP_NUM;
      if (END_BUS_STOP_NUM) {
        direction2 = await fetch(
          `https://www.onemap.gov.sg/omapp/getBusRoutes?busSvcNo=${number}&startBusStopNo=${END_BUS_STOP_NUM}`,
          { json: true, headers: { Cookie: `OMITN=${token}` } },
        );
      }
    }
    const diff =
      direction2?.[0]?.START_BUS_STOP_NUM !==
      direction1?.[0]?.START_BUS_STOP_NUM;
    const directions = {
      BUS_DIRECTION_ONE: direction1 || direction2,
      BUS_DIRECTION_TWO: diff ? direction2 : null,
    };
    if (directions.BUS_DIRECTION_ONE) {
      writeFile(`data/v1/patch/${number}.om.json`, directions);
    } else {
      // throw 'what';
      console.warn(`Bus service ${number} is missing`);
    }
  }
})();
