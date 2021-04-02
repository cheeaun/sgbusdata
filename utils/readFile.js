const fs = require('fs');

module.exports = (fileName) => {
  console.log(`📖 Read file: ${fileName}`);
  const content = fs.readFileSync(fileName, 'utf-8');
  return JSON.parse(content);
};
