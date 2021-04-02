require('dotenv').config();
const { fetch, writeFile } = require('../utils');

(async () => {
  const values = [];
  let skip = 0;
  let data;
  do {
    data = await fetch(
      `http://datamall2.mytransport.sg/ltaodataservice/BusStops?$skip=${skip}`,
      {
        json: true,
        headers: {
          AccountKey: process.env.DatamallAccountKey,
        },
      },
    );
    values.push(...data.value);
    skip += 500;
  } while (!!data.value.length);

  writeFile('./data/v1/raw/bus-stops.datamall.json', values);
})();
