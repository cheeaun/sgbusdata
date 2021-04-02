const parser = require('fast-xml-parser');

module.exports = (xml, opts) =>
  parser.parse(xml, {
    attributeNamePrefix: '',
    ignoreAttributes: false,
    parseAttributeValue: false,
    ignoreNameSpace: true,
    allowBooleanAttributes: true,
    ...opts,
  });
