const { fetch, parseXML, writeFile } = require('../utils');

(async () => {
  const data = await fetch(
    'https://www.lta.gov.sg/map/busService/bus_services.xml',
  );
  const json = parseXML(data, {
    arrayMode: /^file$/i,
  });

  const busServices = [];
  Object.entries(json.bus_service_list).forEach(([type, value]) => {
    const services = value.bus_service.map((s) => {
      const { kmlFile, routeFile, ...props } = s;
      return {
        ...props,
        type,
        kmlFile: kmlFile.file,
        routeFile: routeFile.file,
      };
    });
    busServices.push(...services);
  });
  writeFile('data/v1/raw/bus-services.json', busServices);
})();
