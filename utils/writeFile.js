const fs = require('fs');
const path = require('path');

module.exports = (fileName, data) => {
  fs.mkdirSync(path.dirname(fileName), { recursive: true });
  if (/\.min\.[^.]+$/.test(fileName)) {
    fs.writeFileSync(fileName, JSON.stringify(data));
  } else {
    fs.writeFileSync(fileName, JSON.stringify(data, null, '\t'));
  }
  console.log(`✏️ File written: ${fileName}`);
};
