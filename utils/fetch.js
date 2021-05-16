const got = require('got');

module.exports = (url, opts) => {
  const { json = false, ...restOpts } = opts || {};
  console.log(`🥏 ${url}`);
  return got(url, {
    responseType: json ? 'json' : 'text',
    timeout: 60 * 1000,
    ...restOpts,
  }).then((res) => res.body);
};
