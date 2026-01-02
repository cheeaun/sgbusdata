const polyline = require('@mapbox/polyline');
const simplify = require('simplify-js');
function coords2polyline(coords) {
  // convert lng lat to X Y
  const xyCoords = coords.map((coord) => ({ x: coord[0], y: coord[1] }));
  const simplifiedCoords = simplify(xyCoords, 0.00005, true); // returns X Y
  // polyline accepts lat lng instead of lng lat
  return polyline.encode(simplifiedCoords.map((coord) => [coord.y, coord.x]));
}

const { round } = require('@turf/helpers');

const path = require('path');
const { readFile, writeFile } = require('../utils');

const Validator = require('fastest-validator');
const validator = new Validator();

const stops = readFile('./data/v1/raw/bus-stops.json');
const stopsDatamall = readFile('./data/v1/raw/bus-stops.datamall.json');
const services = readFile('./data/v1/raw/bus-services.json');

let stopNames = {};
const stopNamesArr = readFile('./data/v1/patch/bus-stop-names.json');
stopNamesArr.forEach((s) => {
  stopNames[s.number] = s.newName;
});

const missingRoutesServices = readFile(
  './data/v1/patch/bus-services-routes.failures.json',
).failedKMLs.map((d) => path.parse(d.fileName).name.replace(/-\d+$/, ''));
const multilineRoutesServices = readFile(
  './data/v1/patch/patch-multiple-routes.results.json',
).map((d) => '' + d.number);
const faultyRoutesServices = [
  ...missingRoutesServices,
  ...multilineRoutesServices,
];

const missingServices = readFile('./data/v1/patch/missing-services.json');

const servicesJSON = {};
const stopsJSON = {};

const stopsData = {};
const stopsServices = {};
const routesFeatures = [];
const routesPolylines = {};

stops
  .filter((s) => !/^-/.test(s.name))
  .sort((a, b) => {
    if ('' + a.name < '' + b.name) return -1;
    if ('' + a.name > '' + b.name) return 1;
    return 0;
  })
  .forEach((s) => {
    const {
      name,
      details,
      coordinates: { long, lat },
    } = s;
    const number = '' + name; // Stringify, even when it's just numbers
    const stopName = stopNames[number] || details;
    let road;

    stopsDatamall.forEach((s) => {
      if (s.BusStopCode == number) {
        road = s.RoadName;
      }
    });

    stopsJSON[number] = [round(long, 5), round(lat, 5), stopName, road];
    stopsData[number] = {
      number,
      name: stopName,
      road,
      coordinates: [long, lat],
    };
  });

function generateRoutesName(routes) {
  let name = '';
  if (routes.length == 1) {
    const route = routes[0];
    const [firstStop, ...rest] = route;
    const lastStop = rest.pop();
    if (firstStop === lastStop) {
      const midStop = rest[Math.floor((rest.length - 1) / 2)];
      name = `${stopsData[firstStop].name} ⟲ ${stopsData[midStop].name}`;
    } else {
      name = `${stopsData[firstStop].name} → ${stopsData[lastStop].name}`;
    }
  } else {
    // If A -> B, B -> A, becomes "A <-> B"
    // If A -> B, B -> C, becomes "A / C <-> B" (Special slash)
    const [route1, route2] = routes;
    const firstStops =
      route1[0] == route2[route2.length - 1]
        ? [route1[0]]
        : [route1[0], route2[route2.length - 1]];
    const lastStops =
      route2[0] == route1[route1.length - 1]
        ? [route1[route1.length - 1]]
        : [route1[route1.length - 1], route2[0]];
    const firstStopsName = firstStops.map((s) => stopsData[s].name).join(' / ');
    const lastStopsName = lastStops.map((s) => stopsData[s].name).join(' / ');
    if (firstStopsName == lastStopsName) {
      name = firstStopsName;
    } else {
      name = `${firstStopsName} ⇄ ${lastStopsName}`;
    }
  }
  return name;
}

services
  .filter(
    (s) =>
      !/^-/.test(s.number) &&
      /^(CITYDIRECT|TRUNK)$/.test(s.type) &&
      !missingServices.includes(s.number),
  )
  .sort((a, b) => {
    if ('' + a.number < '' + b.number) return -1;
    if ('' + a.number > '' + b.number) return 1;
    return 0;
  })
  .forEach((s) => {
    const { number, type, kmlFile } = s;
    const num = '' + number;
    if (!routesPolylines[num]) routesPolylines[num] = [];

    let route;
    try {
      route = readFile(`./data/v1/raw/services/${type}/${number}.json`)
        // So, some routes have patterns that don't have stops
        // They're known as "missing data"
        // So here we're filtering them out and later *try* to link to the correct patterns and lines
        .filter((pattern) => !!pattern.stops.length);
      route.forEach((pattern) => {
        pattern.stops.forEach((s) => {
          if (stopsServices[s]) {
            stopsServices[s].add(num);
          } else {
            stopsServices[s] = new Set([num]);
          }
        });
      });
    } catch (e) {
      console.error(e);
      delete routesPolylines[num];
      return;
    }

    const stopsRoutes = route.map((r) =>
      r.stops.filter((s) => {
        // Filter out stops that are non-existent?
        return !!stopsData[s];
      }),
    );

    const patterns = kmlFile.map((f) => path.parse(f).name);
    const processPatterns = () => {
      patterns.forEach((p, i) => {
        if (!route[i]) return;
        try {
          const geojson = readFile(
            `./data/v1/raw/services/${type}/${p}.geojson`,
          );
          const feature = geojson.features[0];
          if (feature.geometry.type === 'GeometryCollection') {
            const coordinates = feature.geometry.geometries.reduce((acc, g) => {
              const line = g.coordinates;
              if (acc.length && acc[acc.length - 1].join() === line[0].join()) {
                line.shift(); // Remove first coord
              }
              acc.push(...line);
              return acc;
            }, []);
            routesPolylines[num][i] = coords2polyline(coordinates);
            routesFeatures.push({
              type: 'Feature',
              properties: {
                number: num,
                pattern: i,
              },
              geometry: {
                type: 'LineString',
                coordinates,
              },
            });
          } else if (feature.geometry.type === 'LineString') {
            routesPolylines[num][i] = coords2polyline(
              feature.geometry.coordinates,
            );
            routesFeatures.push({
              type: 'Feature',
              properties: {
                number: num,
                pattern: i,
              },
              geometry: feature.geometry,
            });
          } else {
            throw new Error(
              'Feature is neither GeometryCollection or LineString.',
            );
          }
        } catch (e) {
          console.warn(e);
        }
      });
    };
    if (faultyRoutesServices.includes(num)) {
      const patchPatterns = [];
      let fauxError = false;
      try {
        // First, read from OneMap
        const patchRoute = readFile(`./data/v1/patch/${num}.om.json`);
        const { BUS_DIRECTION_ONE, BUS_DIRECTION_TWO } = patchRoute;
        if (BUS_DIRECTION_ONE) {
          const firstStop = BUS_DIRECTION_ONE.find(
            (s) => s.BUS_SEQUENCE === 1,
          ).START_BUS_STOP_NUM;
          const coordinates = BUS_DIRECTION_ONE.reduce((acc, v) => {
            // const line = polyline
            //   .decode(v.GEOMETRIES)
            //   .map((coords) => coords.reverse());
            const line = v.GEOMETRIES;
            if (acc.length && acc[acc.length - 1].join() === line[0].join()) {
              line.shift(); // Remove first coord
            }
            acc.push(...line);
            return acc;
          }, []);
          patchPatterns.push({
            firstStop,
            coordinates,
          });
        }
        if (BUS_DIRECTION_TWO) {
          const firstStop = BUS_DIRECTION_TWO.find(
            (s) => s.BUS_SEQUENCE === 1,
          ).START_BUS_STOP_NUM;
          const coordinates = BUS_DIRECTION_TWO.reduce((acc, v) => {
            // const line = polyline
            //   .decode(v.GEOMETRIES)
            //   .map((coords) => coords.reverse());
            const line = v.GEOMETRIES;
            if (acc.length && acc[acc.length - 1].join() === line[0].join()) {
              line.shift(); // Remove first coord
            }
            acc.push(...line);
            return acc;
          }, []);
          patchPatterns.push({
            firstStop,
            coordinates,
          });
        }
      } catch (e) {
        console.error(e);
        // If fails, read from CityMapper
        try {
          const patchRoute = readFile(`./data/v1/patch/${num}.cm.json`);
          patchRoute.routes[0].patterns.forEach((p) => {
            const firstStop = patchRoute.stops[p.stop_points[0].id].stop_code;
            const coordinates = p.path.map((coords) => coords.reverse());
            patchPatterns.push({
              firstStop,
              coordinates,
            });
          });
        } catch (e) {
          console.warn(e);
          fauxError = true;
        }
      }

      if (!fauxError) {
        route.forEach((pattern, i) => {
          let theRightPattern = patchPatterns.find(
            (p) => p.firstStop == pattern.stops[0],
          );
          if (!theRightPattern) {
            // This means the route might contain 2 patterns
            // But somehow one of them is missing
            // Affected bus service: 911
            console.warn(`⚠️⚠️⚠️ Bus service ${num} doesn't have pattern ${i}`);
            if (i === 0) {
              theRightPattern = patchPatterns[0];
            } else {
              return;
            }
          }
          const coordinates = theRightPattern.coordinates;
          routesPolylines[num][i] = coords2polyline(coordinates);
          routesFeatures.push({
            type: 'Feature',
            properties: {
              number: num,
              pattern: i,
            },
            geometry: {
              type: 'LineString',
              coordinates,
            },
          });
        });
      } else {
        processPatterns();
      }
    } else {
      processPatterns();
    }

    // Filter out failed patterns and match stopsRoutes with successful polylines
    const validIndices = [];
    routesPolylines[num].forEach((polyline, i) => {
      if (polyline !== undefined) {
        validIndices.push(i);
      }
    });

    // Filter stopsRoutes to only include successful patterns
    const filteredStopsRoutes = validIndices.map(i => stopsRoutes[i]);

    // Compact routesPolylines array (remove undefined holes)
    routesPolylines[num] = routesPolylines[num].filter(p => p !== undefined);

    // Handle edge case: if all patterns failed, skip this service
    if (routesPolylines[num].length === 0) {
      delete routesPolylines[num];
      return;
    }

    // Update servicesJSON with filtered routes
    servicesJSON[num] = {
      name: generateRoutesName(filteredStopsRoutes),
      routes: filteredStopsRoutes,
    };
  });

routesFeatures.sort((a, b) => {
  if (a.properties.number < b.properties.number) return -1;
  if (a.properties.number > b.properties.number) return 1;
  if (a.properties.pattern < b.properties.pattern) return -1;
  if (a.properties.pattern > b.properties.pattern) return 1;
  return 0;
});

const stopsFeatures = Object.values(stopsData)
  .filter((d) => !!stopsServices[d.number])
  .map((d) => {
    const { number, name, coordinates, road } = d;
    return {
      type: 'Feature',
      id: number,
      properties: {
        number,
        name,
        road,
        services: [...stopsServices[number]].sort(),
      },
      geometry: {
        type: 'Point',
        coordinates,
      },
    };
  });

// GeoJSONs
// ===

// Stops GeoJSON
const stopsGeoJSON = {
  type: 'FeatureCollection',
  features: stopsFeatures,
};
let e = validator.validate(stopsGeoJSON, {
  type: { type: 'equal', value: 'FeatureCollection' },
  features: {
    type: 'array',
    empty: false,
    items: {
      $$type: 'object',
      type: { type: 'equal', value: 'Feature' },
      id: { type: 'string', empty: false },
      properties: {
        $$type: 'object',
        number: { type: 'string', empty: false },
        name: { type: 'string', empty: false },
        road: { type: 'string', empty: false },
        services: 'string[]',
      },
      geometry: {
        $$type: 'object',
        type: { type: 'equal', value: 'Point' },
        coordinates: {
          type: 'array',
          empty: false,
          items: 'number',
          length: 2,
        },
      },
    },
  },
});
if (e.length) throw e;
writeFile('./data/v1/stops.geojson', stopsGeoJSON);
writeFile('./data/v1/stops.min.geojson', stopsGeoJSON);

// Routes GeoJSON
const routesGeoJSON = {
  type: 'FeatureCollection',
  features: routesFeatures,
};
e = validator.validate(routesGeoJSON, {
  type: { type: 'equal', value: 'FeatureCollection' },
  features: {
    type: 'array',
    empty: false,
    items: {
      $$type: 'object',
      type: { type: 'equal', value: 'Feature' },
      properties: {
        $$type: 'object',
        number: { type: 'string', empty: false },
        pattern: { type: 'number', integer: true, min: 0, max: 1 },
      },
      geometry: {
        $$type: 'object',
        type: { type: 'equal', value: 'LineString' },
        coordinates: {
          type: 'array',
          empty: false,
          items: {
            type: 'array',
            empty: false,
            items: 'number',
            length: 2,
          },
        },
      },
    },
  },
});
if (e.length) throw e;
writeFile('./data/v1/routes.geojson', routesGeoJSON);
writeFile('./data/v1/routes.min.geojson', routesGeoJSON);

// Complementary JSONs
// ===

// Stops JSON
// Convert hash to [key, value] because the validator doesn't support dynamic keys
e = validator.validate(Object.entries(stopsJSON), {
  $$root: true,
  type: 'array',
  empty: false,
  items: {
    type: 'tuple',
    empty: false,
    items: [
      { type: 'string', empty: false },
      {
        type: 'tuple',
        empty: false,
        items: [
          { type: 'number' },
          { type: 'number' },
          { type: 'string', empty: false },
          { type: 'string', empty: false },
        ],
      },
    ],
  },
});
if (e.length) throw e;
writeFile('./data/v1/stops.json', stopsJSON);
writeFile('./data/v1/stops.min.json', stopsJSON);

// Services JSON
e = validator.validate(Object.entries(servicesJSON), {
  $$root: true,
  type: 'array',
  empty: false,
  items: {
    type: 'tuple',
    empty: false,
    items: [
      { type: 'string', empty: false },
      {
        $$type: 'object',
        name: { type: 'string', empty: false },
        routes: {
          type: 'array',
          empty: false,
          items: { type: 'array', empty: false, items: 'string' },
        },
      },
    ],
  },
});
if (e.length) throw e;
writeFile('./data/v1/services.json', servicesJSON);
writeFile('./data/v1/services.min.json', servicesJSON);

// Route Polylines
e = validator.validate(Object.entries(routesPolylines), {
  $$root: true,
  type: 'array',
  empty: false,
  items: {
    type: 'tuple',
    empty: false,
    items: [
      { type: 'string', empty: false },
      {
        type: 'array',
        empty: false,
        items: {
          type: 'string',
          empty: false,
        },
      },
    ],
  },
});
if (e.length) {
  // writeFile('./data/v1/routes.error.json', routesPolylines);
  throw e;
}
writeFile('./data/v1/routes.json', routesPolylines);
writeFile('./data/v1/routes.min.json', routesPolylines);
