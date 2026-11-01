const polyline = require('@mapbox/polyline');

module.exports = function oneMapPatterns(direction) {
  const segments = [...direction].sort((a, b) => a.BUS_SEQUENCE - b.BUS_SEQUENCE);
  const firstStop = segments[0].START_BUS_STOP_NUM;
  const closed = segments[segments.length - 1].END_BUS_STOP_NUM === firstStop;

  // A route can visit the interchange between loops. Each such visit can
  // start a supported pattern with the same segments in a different order.
  return segments.flatMap((segment, index) => {
    if (index && (!closed || segment.START_BUS_STOP_NUM !== firstStop)) return [];
    const ordered = [...segments.slice(index), ...segments.slice(0, index)];
    const stops = [firstStop, ...ordered.map((s) => s.END_BUS_STOP_NUM)];
    const coordinates = ordered.reduce((acc, s) => {
      const line = polyline.decode(s.GEOMETRIES).map(([lat, lng]) => [lng, lat]);
      if (acc.length && acc[acc.length - 1].join() === line[0].join()) {
        line.shift();
      }
      acc.push(...line);
      return acc;
    }, []);
    return [{ firstStop, stops, coordinates }];
  });
};
