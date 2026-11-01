const assert = require('assert/strict');
const test = require('node:test');
const polyline = require('@mapbox/polyline');
const oneMapPatterns = require('./one-map-patterns');

test('service 358 preserves both ordered loops', () => {
  const { BUS_DIRECTION_ONE: direction } = require('../../data/v1/patch/358.om.json');
  const routes = require('../../data/v1/raw/services/TRUNK/358.json');
  const patterns = oneMapPatterns(direction);
  assert.equal(patterns.length, 2);
  routes.forEach(({ stops }, index) => {
    assert.deepEqual(patterns[index].stops, stops);
    const ordered = index ? [...direction.slice(11), ...direction.slice(0, 11)] : direction;
    const expected = ordered.flatMap((s) =>
      polyline.decode(s.GEOMETRIES).map(([lat, lng]) => [lng, lat]),
    ).filter((coord, i, all) => !i || coord.join() !== all[i - 1].join());
    const actual = patterns[index].coordinates.filter((coord, i, all) =>
      !i || coord.join() !== all[i - 1].join(),
    );
    assert.deepEqual(actual, expected);
  });
  assert.notDeepEqual(patterns[0].coordinates, patterns[1].coordinates);
  assert.deepEqual(oneMapPatterns([...direction].reverse()), patterns);
});

test('an open route keeps its original segment order', () => {
  const segment = (sequence, start, end) => ({
    BUS_SEQUENCE: sequence,
    START_BUS_STOP_NUM: start,
    END_BUS_STOP_NUM: end,
    GEOMETRIES: polyline.encode([[1, sequence], [1, sequence + 1]]),
  });
  const patterns = oneMapPatterns([
    segment(1, 'A', 'B'), segment(2, 'B', 'A'), segment(3, 'A', 'C'),
  ]);
  assert.equal(patterns.length, 1);
  assert.deepEqual(patterns[0].stops, ['A', 'B', 'A', 'C']);
});

test('published route files retain both service 358 patterns in stop order', () => {
  const fs = require('fs');
  const path = require('path');
  const simplify = require('simplify-js');
  const { BUS_DIRECTION_ONE } = require('../../data/v1/patch/358.om.json');
  const patterns = oneMapPatterns(BUS_DIRECTION_ONE);
  const services = require('../../data/v1/services.json');
  const routes = require('../../data/v1/routes.json');
  assert.equal(services['358'].routes.length, 2);
  assert.equal(routes['358'].length, 2);
  for (const suffix of ['', '.min']) {
    const published = require(`../../data/v1/routes${suffix}.json`);
    const geojson = JSON.parse(fs.readFileSync(
      path.join(__dirname, `../../data/v1/routes${suffix}.geojson`), 'utf8',
    ));
    patterns.forEach(({ stops, coordinates }, index) => {
      assert.deepEqual(services['358'].routes[index], stops);
      const feature = geojson.features.find((f) =>
        f.properties.number === '358' && f.properties.pattern === index,
      );
      assert.deepEqual(feature.geometry.coordinates, coordinates);
      const simplified = simplify(coordinates.map(([x, y]) => ({ x, y })), 0.00005, true);
      assert.equal(published['358'][index], polyline.encode(simplified.map(({ x, y }) => [y, x])));
    });
  }
  assert.notEqual(routes['358'][0], routes['358'][1]);
});
