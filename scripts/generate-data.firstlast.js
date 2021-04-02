const { readFile, writeFile } = require('../utils');
const Validator = require('fastest-validator');
const validator = new Validator();

const busStops = readFile('./data/v1/raw/bus-stops.json')
  .filter((s) => !/^-/.test(s.name))
  .map((s) => s.name);
const busRoutes = readFile('./data/v1/raw/bus-routes.datamall.json');

const firstLastJSON = {};
busRoutes.forEach((r) => {
  const {
    ServiceNo,
    BusStopCode,
    WD_FirstBus,
    WD_LastBus,
    SAT_FirstBus,
    SAT_LastBus,
    SUN_FirstBus,
    SUN_LastBus,
  } = r;
  if (!busStops.includes(BusStopCode)) {
    console.warn(
      `Service ${ServiceNo} not included. Stop number is ${BusStopCode}`,
    );
    return;
  }
  const satFirst =
    SAT_FirstBus !== '-' && SAT_FirstBus === WD_FirstBus ? '=' : SAT_FirstBus;
  const satLast =
    SAT_LastBus !== '-' && SAT_LastBus === WD_LastBus ? '=' : SAT_LastBus;
  const sunFirst =
    SUN_FirstBus !== '-' && SUN_FirstBus === WD_FirstBus ? '=' : SUN_FirstBus;
  const sunLast =
    SUN_LastBus !== '-' && SUN_LastBus === WD_LastBus ? '=' : SUN_LastBus;

  // If '-', means unavailable
  // If '=', means it's the same as weekday's timing

  if (!firstLastJSON[BusStopCode]) firstLastJSON[BusStopCode] = [];
  firstLastJSON[BusStopCode].push(
    `${ServiceNo} ${WD_FirstBus} ${WD_LastBus} ${satFirst} ${satLast} ${sunFirst} ${sunLast}`,
  );
});

let e = validator.validate(Object.entries(firstLastJSON), {
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
          pattern: /^\w+\s(\d{4}|-)\s(\d{4}|-)\s(\d{4}|=|-)\s(\d{4}|=|-)\s(\d{4}|=|-)\s(\d{4}|=|-)$/i,
        },
      },
    ],
  },
});
if (e.length) throw e;
writeFile('./data/v1/firstlast.json', firstLastJSON);
writeFile('./data/v1/firstlast.min.json', firstLastJSON);
