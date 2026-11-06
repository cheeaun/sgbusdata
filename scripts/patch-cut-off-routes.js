const sortKeys = require('sort-keys');
const { fetch, readFile, writeFile } = require('../utils');

const cutOffRoutes = readFile(
  './data/v1/patch/bus-services-routes.cut-off.json',
);
const serviceNumbers = [
  ...new Set(cutOffRoutes.map((route) => String(route.number))),
];

(async () => {
  for (const number of serviceNumbers) {
    try {
      const directions = await fetch(
        `https://www.onemap.gov.sg/omapi/om/api/private/busexp/getBusRoutes?busNo=${number}`,
        { json: true, headers: { Referer: 'https://www.onemap.gov.sg/bus' } },
      );
      if (directions.BUS_DIRECTION_ONE || directions.BUS_DIRECTION_TWO) {
        writeFile(`data/v1/patch/${number}.om.json`, directions);
      } else {
        console.warn(`No OneMap fallback returned for cut-off service ${number}`);
      }
    } catch (e) {
      console.warn(`Failed to fetch OneMap fallback for ${number}: ${e.message}`);
    }

    try {
      const { results } = await fetch(
        `https://citymapper.com/api/2/findtransport?query=${number}&region_id=sg-singapore`,
        { json: true },
      );
      const match = results?.find(
        (result) => result.display_name === number,
      );
      if (!match) {
        console.warn(`No Citymapper route found for cut-off service ${number}`);
      } else {
        const routeInfo = await fetch(
          `https://citymapper.com/api/1/routeinfo?route=${match.id}&region_id=sg-singapore&weekend=1&status_format=rich`,
          { json: true },
        );
        if (routeInfo.routes?.length) {
          writeFile(
            `data/v1/patch/${number}.cm.json`,
            sortKeys(routeInfo, { deep: true }),
          );
        } else {
          console.warn(
            `No Citymapper route details returned for cut-off service ${number}`,
          );
        }
      }
    } catch (e) {
      console.warn(`Failed to fetch Citymapper fallback for ${number}: ${e.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
})();
