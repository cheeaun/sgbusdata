const DOMParser = require('xmldom').DOMParser;

module.exports = (str) => {
  return new DOMParser().parseFromString(str);
};
