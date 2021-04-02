const { fetch, parseXML, writeFile } = require('../utils');

(async () => {
  const data = await fetch(
    'https://www.lta.gov.sg/map/busService/bus_stops.xml',
  );
  const json = parseXML(data);
  writeFile('data/v1/raw/bus-stops.json', json.busstops.busstop);
})();
