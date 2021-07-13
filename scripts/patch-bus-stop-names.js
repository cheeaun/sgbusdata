const FormData = require('form-data');
const { fetch, readFile, writeFile } = require('../utils');

const stops = readFile('./data/v1/raw/bus-stops.json');
const faultyStopNames = [];

const legitStops = stops.filter((s) => !/^-/.test(s.name));

(async () => {
  for (let i = 0; i < legitStops.length; i++) {
    const stop = legitStops[i];
    const { name: number, details: name } = stop;
    if (!/[a-z]/.test(name) && /[A-Z]{2,}/.test(name)) {
      const form = new FormData();
      form.append('bs_code', '-');
      form.append('bscode', number);
      console.log(`🚏 ${number}`);
      const html = await fetch(
        `https://www.transitlink.com.sg/eservice/eguide/bscode_idx.php`,
        {
          method: 'POST',
          body: form,
        }
      );
      const [_, newName] = html.match(
        /<td class="data">[^<>]+<\/td>[\s\n\r\t]+<td class="data">([^<>]+)/i
      ) || [, null];
      faultyStopNames.push({ number, name, newName });

      // Wait a second
      await new Promise((res) => setTimeout(res, 1000));
    }
  }

  console.table(faultyStopNames);

  writeFile('./data/v1/patch/bus-stop-names.json', faultyStopNames);
})();
