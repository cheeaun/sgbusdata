const { diff } = require('just-diff');
const hyperdiff = require('hyperdiff');
const { execSync } = require('child_process');
const readOldNewData = (path) => {
  const oldData = JSON.parse(
    execSync(`git show $(git branch --show-current):${path}`, {
      encoding: 'utf8',
    }),
  );
  const newData = require('../' + path);
  return [oldData, newData];
};

const nlog = (str) => console.log(`\n${str}`);
const log = (str) => console.log(str);

// It's fine to use SG timezone here because everything is in SG
log(
  `# ${new Date().toLocaleDateString('en-SG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })}`,
);

const [oldStops, newStops] = readOldNewData('data/v1/stops.json');

const oldStopsCount = Object.keys(oldStops).length;
const newStopsCount = Object.keys(newStops).length;

if (oldStopsCount !== newStopsCount) {
  nlog(`## Stops count change: ${oldStopsCount} ⮕ ${newStopsCount}`);
}

const stopsDiff = diff(oldStops, newStops);

if (stopsDiff.length) {
  const addedDiff = stopsDiff.filter((d) => d.op === 'add');
  if (addedDiff.length) {
    nlog(`### Stops added: ${addedDiff.length}\n`);
    addedDiff.forEach((d) => {
      const { path, value } = d;
      log(`- \`${path[0]}\` ${value[2]}`);
    });
  }

  const removedDiff = stopsDiff.filter((d) => d.op === 'remove');
  if (removedDiff.length) {
    nlog(`### Stops removed: ${removedDiff.length}\n`);
    removedDiff.forEach((d) => {
      const { path } = d;
      const oldValue = oldStops[path[0]];
      log(`- \`${path[0]}\` ${oldValue[2]}`);
    });
  }

  const replacedDiff = stopsDiff.filter((d) => d.op === 'replace');
  if (replacedDiff.length) {
    const nameChangedDiff = replacedDiff.filter((d) => d.path[1] === 2);
    const locationChangedDiff = replacedDiff.filter((d) => d.path[1] !== 2);

    if (nameChangedDiff.length) {
      nlog(`### Stop names changed: ${nameChangedDiff.length}\n`);
      nameChangedDiff.forEach((d) => {
        const { path, value } = d;
        const number = path[0];
        const oldValue = oldStops[path[0]][path[1]];
        log(`- \`${number}\` ${oldValue} ⮕ ${value}`);
      });
    }

    if (locationChangedDiff.length) {
      let prevNumbers = [];
      const uniqLocationChangedDiff = locationChangedDiff.filter((d) => {
        const { path } = d;
        const number = path[0];
        // Skip if same numbers because the diff will be duplicated for both lat and lng changes (one diff each)
        if (prevNumbers.includes(number)) {
          return false;
        }
        prevNumbers.push(number);
        return true;
      });
      nlog(`### Stop locations changed: ${uniqLocationChangedDiff.length}\n`);
      uniqLocationChangedDiff.forEach((d) => {
        const { path } = d;
        const number = path[0];
        const oldCoord = [oldStops[path[0]][0], oldStops[path[0]][1]];
        const newCoord = [newStops[path[0]][0], newStops[path[0]][1]];
        log(`- \`${number}\` ${oldCoord.join(',')} ⮕ ${newCoord.join(',')}`);
      });
    }
  }
}

const [oldServices, newServices] = readOldNewData('data/v1/services.json');

const oldServicesCount = Object.keys(oldServices).length;
const newServicesCount = Object.keys(newServices).length;

if (oldServicesCount !== newServicesCount) {
  nlog(`## Services count change: ${oldServicesCount} ⮕ ${newServicesCount}`);
}

const servicesDiff = diff(oldServices, newServices);

if (servicesDiff.length) {
  const addedDiff = servicesDiff.filter(
    (d) => d.op === 'add' && d.path[1] !== 'routes',
  );
  if (addedDiff.length) {
    nlog(`### Services added: ${addedDiff.length}\n`);
    addedDiff.forEach((d) => {
      const { path, value } = d;
      log(`- \`${path[0]}\` ${value.name}`);
    });
  }

  const removedDiff = servicesDiff.filter(
    (d) => d.op === 'remove' && d.path[1] !== 'routes',
  );
  if (removedDiff.length) {
    nlog(`### Services removed: ${removedDiff.length}\n`);
    removedDiff.forEach((d) => {
      const { path } = d;
      const name = oldServices[path[0]].name;
      log(`- \`${path[0]}\` ${name}`);
    });
  }

  const changedRoutesDiff = servicesDiff.filter((d) => d.path[1] == 'routes');
  const changedRoutesServices = new Set();
  changedRoutesDiff.forEach((d) => {
    changedRoutesServices.add(d.path[0]);
  });

  if (changedRoutesServices.size) {
    nlog(`### Bus Stop Changes To Routes: ${changedRoutesServices.size}\n`);
    changedRoutesServices.forEach((s) => {
      const oldRoutes = oldServices[s].routes;
      const newRoutes = newServices[s].routes;

      const { added, removed } = hyperdiff(oldRoutes.flat(), newRoutes.flat());
      const addedCount = added.length;
      const removedCount = removed.length;
      log(
        `- \`${s}\` ${newServices[s].name}: ${
          addedCount ? `+${addedCount}` : ''
        }${addedCount && removedCount ? ', ' : ''}${
          removedCount ? `-${removedCount}` : ''
        }`,
      );
    });
  }
}

const [oldRoutes, newRoutes] = readOldNewData('data/v1/routes.json');
const routesDiff = diff(oldRoutes, newRoutes);

if (routesDiff.length) {
  const services = [...new Set(routesDiff.map((d) => d.path[0]))].filter(
    (s) => !!newServices[s],
  );
  if (services.length) {
    nlog(`## Routes changed: ${services.length}\n`);
    services.forEach((service) => {
      log(`- \`${service}\` ${newServices[service].name}`);
    });
  }
}

const rewriteFL = (fl) => {
  // Have to "rewrite" the first/last data structure because diffing is too hard
  // We only need to know which services are affected, don't really care about the stops
  // The timings also don't have to be detailed as we only need to know they changed
  const newFL = {};
  Object.entries(fl).forEach(([_, serviceTimings]) => {
    serviceTimings.forEach((serviceTiming) => {
      const [service, ...timing] = serviceTiming.split(' ');
      if (!newFL[service]) newFL[service] = '';
      // Append timings as strings, don't really care about the order etc
      newFL[service] += timing;
    });
  });
  return newFL;
};
const [oldFL, newFL] = readOldNewData('data/v1/firstlast.json');
const flDiff = diff(rewriteFL(oldFL), rewriteFL(newFL));

if (flDiff.length) {
  nlog(`## First/last timings changed\n`);
  const services = flDiff.map((fl) => fl.path[0]);
  log(`Affected services: ${services.map((s) => `\`${s}\``).join(', ')}`);
}

// Throw an error to stop everything if there are no changes
if (
  !stopsDiff.length &&
  !servicesDiff.length &&
  !routesDiff.length &&
  !flDiff.length
) {
  throw new Error('There are no changes at all!');
}
