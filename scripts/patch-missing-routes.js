const { fetch, readFile, writeFile } = require('../utils');

const services = readFile('./data/v1/raw/bus-services.json');
const { failedXMLs, failedKMLs } = readFile(
  './data/v1/patch/bus-services-routes.failures.json',
);

// Not handling failed XMLs for now

// Handling failed KMLs
const missingServices = failedKMLs.map((d) => {
  const [_, serviceNumber, pattern] = d.fileName.match(/^([^-]+)-(\d)\./i);
  const service = services.find((s) => s.number == serviceNumber);
  const serviceData = readFile(
    `./data/v1/raw/services/${service.type}/${serviceNumber}.json`,
  );
  const pat = Number(pattern);
  if (serviceData[pat - 1]) {
    return [serviceNumber, pat];
  } else {
    // Patterns
    console.warn(`Missing pattern ${pat} for service ${serviceNumber}`);
  }
});

(async () => {
  for (let i = 0; i < missingServices.length; i++) {
    const missingService = missingServices[i];
    if (!missingService) continue;
    const [number] = missingService;
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
  }
})();

console.log(missingServices);
