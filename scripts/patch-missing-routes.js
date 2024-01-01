const sortKeys = require('sort-keys');
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
    return [serviceNumber, pat, serviceData];
  } else {
    // Patterns
    console.warn(`Missing pattern ${pat} for service ${serviceNumber}`);
  }
});

(async () => {
  // OLD:
  // const { access_token } = await fetch(
  //   'https://developers.onemap.sg/publicapi/publicsessionid',
  //   {
  //     json: true,
  //   },
  // );

  // NEW:
  const res = await fetch('https://www.onemap.gov.sg/', {
    returnResponse: true,
  });
  const cookie = res.headers['set-cookie'][0]; // string
  const token = cookie.match(/OMITN=(.*?);/)[1];

  const srslyMissingServices = [];

  for (let i = 0; i < missingServices.length; i++) {
    const missingService = missingServices[i];
    if (!missingService) continue;
    const [number, _pat, data] = missingService;
    try {
      // OLD:
      // `https://developers.onemap.sg/publicapi/busexp/getBusRoutes?busNo=${number}&token=${access_token}`,
      // NEW: https://www.onemap.gov.sg/omapp/getBusRoutes?busSvcNo=13&startBusStopNo=10
      const direction1 = await fetch(
        `https://www.onemap.gov.sg/omapp/getBusRoutes?busSvcNo=${number}&startBusStopNo=${data[0].stops[0]}`,
        { json: true, headers: { Cookie: `OMITN=${token}` } },
      );
      const direction2 = data[1]
        ? await fetch(
            `https://www.onemap.gov.sg/omapp/getBusRoutes?busSvcNo=${number}&startBusStopNo=${data[1].stops[0]}`,
            { json: true, headers: { Cookie: `OMITN=${token}` } },
          )
        : null;
      const diff =
        direction2?.[0]?.START_BUS_STOP_NUM !==
        direction1?.[0]?.START_BUS_STOP_NUM;
      const directions = {
        BUS_DIRECTION_ONE: direction1 || direction2,
        BUS_DIRECTION_TWO: diff ? direction2 : null,
      };
      if (directions.BUS_DIRECTION_ONE) {
        const firstBusStop = directions.BUS_DIRECTION_ONE[0].START_BUS_STOP_NUM;
        const dataFirstBusStop = data[0].stops[0];
        if (dataFirstBusStop !== firstBusStop) {
          console.log(
            `⚠️⚠️⚠️ For ${number}, there's a bus stop mismatch! ${dataFirstBusStop} != ${firstBusStop}`,
          );
        } else {
          writeFile(`data/v1/patch/${number}.om.json`, directions);
          continue;
        }
      } else {
      }
    } catch (e) {
      console.error(e);
    }

    console.log(
      `⛔️ Bus service ${number} is missing. Falling back to CityMapper`,
    );
    const { results } = await fetch(
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
        writeFile(
          `data/v1/patch/${number}.cm.json`,
          sortKeys(routeInfo, { deep: true }),
        );
      } else {
        console.log(`⛔️ Bus service ${number} is also missing on CityMapper!`);
        srslyMissingServices.push(number);
      }
    } else {
      console.log(`⛔️ Bus service ${number} is also missing on CityMapper!`);
      srslyMissingServices.push(number);
    }
  }

  writeFile('data/v1/patch/missing-services.json', srslyMissingServices);
})();
