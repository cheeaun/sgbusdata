# SG Bus Data

> Singapore Bus data

This is a data-only repository to complement [BusRouter SG](https://github.com/cheeaun/busrouter-sg/).

## The data

It's in the `/data` folder.

## Terminologies

- **Stop** - the bus stop itself
- **Service** - the bus service, with numbers like `133` or `1N`
- **Route** - the route of a bus service, the lines connecting all the stops
- **Pattern** - the patterns of a bus route, _one_ of the lines connecting the stops
  - If the route is one-way (A->B), there's only one pattern
  - If the route is two-way (A->B, B->A), there're two patterns in a route
  - Each pattern usually pass through different stops, as they're usually on opposite sides of the road.

## Scripts

### `npm run cleanup`

Delete files in `data/v1/raw/services/*` and `data/v1/patch/*.cm.json`, _before_ running the commands below.

### `npm run fetch`

- `fetch-bus-stops` - Fetch all bus stops from https://www.lta.gov.sg/map/busService/bus_stops.xml
- `fetch-bus-services` - Fetch bus services from https://www.lta.gov.sg/map/busService/bus_services.xml
- `fetch-bus-services-route` - Fetch all the XMLs and KMLs e.g.: https://www.lta.gov.sg/map/busService/bus_route_xml/10.xml, https://www.lta.gov.sg/map/busService/bus_route_kml/10-1.kml and https://www.lta.gov.sg/map/busService/bus_route_kml/10-2.kml.

### `npm run datamall`

> ⚠️ This requires `DatamallAccountKey` environment variable. Make a copy of `example.env` file, rename to `.env` and put in your [Datamall](https://datamall.lta.gov.sg/) [API key](https://datamall.lta.gov.sg/content/datamall/en/request-for-api.html).

- `fetch-bus-stops-datamall` - Fetch all bus stops from http://datamall2.mytransport.sg/ltaodataservice/BusStops
- `fetch-bus-routes-datamall` - Fetch all bus routes from http://datamall2.mytransport.sg/ltaodataservice/BusRoutes

### `npm run patch`

- `patch-missing-routes` - Patch missing routes (failed requests from `fetch-bus-services-route`) by getting fresh route data from [OneMap](https://www.onemap.gov.sg/)/[Citymapper](https://citymapper.com/).
- `patch-multiline-routes` - Patch multi-line routes (routes that has more than one line, we only need one line here, per pattern) by getting fresh route data from OneMap (again).
- `patch-bus-stop-names` - Patch bus stop names (some of them are all-uppercase instead of titlecase) by double-checking them on https://www.transitlink.com.sg/eservice/eguide/bscode_idx.php

### `npm run generate`

- `generate-data` - Generate all the _final_ clean data
- `generate-data-firstlast` - Generate the first/last timing data

### `npm run build`

Run all `npm` commands above.
