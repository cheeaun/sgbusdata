const parser = require('fast-xml-parser');
const he = require('he');

module.exports = (xml, opts) =>
  parser.parse(xml, {
    attributeNamePrefix: '',
    ignoreAttributes: false,
    parseAttributeValue: false,
    ignoreNameSpace: true,
    allowBooleanAttributes: true,
    attrValueProcessor: (val, attrName) =>
      he.decode(val, { isAttributeValue: true }),
    tagValueProcessor: (val, tagName) => he.decode(val),
    ...opts,
  });
