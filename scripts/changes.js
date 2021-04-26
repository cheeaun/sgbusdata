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

const log = (str) => console.log('\n' + str);

// It's fine to use SG timezone here because everything is in SG
console.log(
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
  log(`## Stops count change: ${oldStopsCount} ⮕ ${newStopsCount}`);
}

const stopsDiff = diff(oldStops, newStops);

if (stopsDiff.length) {
  const addedDiff = stopsDiff.filter((d) => d.op === 'add');
  if (addedDiff.length) {
    log(`### Stops added: ${addedDiff.length}\n`);
    addedDiff.forEach((d) => {
      const { path, value } = d;
      console.log(`- \`${path[0]}\` ${value[2]}`);
    });
  }

  const removedDiff = stopsDiff.filter((d) => d.op === 'remove');
  if (removedDiff.length) {
    log(`### Stops removed: ${removedDiff.length}\n`);
    removedDiff.forEach((d) => {
      const { path, value } = d;
      console.log(`- \`${path[0]}\` ${value[2]}`);
    });
  }

  const replacedDiff = stopsDiff.filter((d) => d.op === 'replace');
  if (replacedDiff.length) {
    log(`### Stops changed: ${replacedDiff.length}\n`);
    replacedDiff.forEach((d) => {
      const { path, value } = d;
      const number = path[0];
      const changeStatus = path[1] === 2 ? 'name' : 'location';
      if (changeStatus === 'name') {
        const oldValue = oldStops[path[0]][path[1]];
        console.log(`- \`${number}\` ${oldValue} ⮕ ${value}`);
      } else {
        // location
        const oldCoord = [oldStops[path[0]][0], oldStops[path[0]][1]];
        const newCoord = [newStops[path[0]][0], newStops[path[0]][1]];
        console.log(
          `- \`${number}\` ${oldCoord.join(',')} ⮕ ${newCoord.join(',')}`,
        );
      }
    });
  }
}

const [oldServices, newServices] = readOldNewData('data/v1/services.json');

const oldServicesCount = Object.keys(oldServices).length;
const newServicesCount = Object.keys(newServices).length;

if (oldServicesCount !== newServicesCount) {
  log(`## Services count change: ${oldServicesCount} ⮕ ${newServicesCount}`);
}

const servicesDiff = diff(oldServices, newServices);

if (servicesDiff.length) {
  const addedDiff = servicesDiff.filter(
    (d) => d.op === 'add' && d.path[1] !== 'routes',
  );
  if (addedDiff.length) {
    log(`### Services added: ${addedDiff.length}\n`);
    addedDiff.forEach((d) => {
      const { path, value } = d;
      console.log(`- \`${path[0]}\` ${value.name}`);
    });
  }

  const removedDiff = servicesDiff.filter(
    (d) => d.op === 'remove' && d.path[1] !== 'routes',
  );
  if (removedDiff.length) {
    log(`### Services removed: ${removedDiff.length}\n`);
    removedDiff.forEach((d) => {
      const { path } = d;
      const name = oldServices[path[0]].name;
      console.log(`- \`${path[0]}\` ${name}`);
    });
  }

  const changedRoutesDiff = servicesDiff.filter((d) => d.path[1] == 'routes');
  const changedRoutesServices = new Set();
  changedRoutesDiff.forEach((d) => {
    changedRoutesServices.add(d.path[0]);
  });

  if (changedRoutesServices.size) {
    log(`### Bus Stop Changes To Routes: ${changedRoutesServices.size}\n`);
    changedRoutesServices.forEach((s) => {
      const oldRoutes = oldServices[s].routes;
      const newRoutes = newServices[s].routes;

      const { added, removed } = hyperdiff(oldRoutes.flat(), newRoutes.flat());
      const addedCount = added.length;
      const removedCount = removed.length;
      console.log(
        `- \`${s}\` ${newServices[s].name}: ${
          addedCount ? `+${addedCount}` : ''
        }${addedCount && removedCount ? ', ' : ''}${
          removedCount ? `-${removedCount}` : ''
        }`,
      );
    });
  }
}
