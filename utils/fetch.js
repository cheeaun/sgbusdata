const got = require('got');

module.exports = (url, opts) => {
  const { json = false, ...restOpts } = opts || {};
  console.log(`🥏 ${url}`);
  return got(url, {
    responseType: json ? 'json' : 'text',
    timeout: 60 * 1000,
    headers: {
      'user-agent': 'sgbusdata/1.0',
    },
    retry: {
      limit: 5,
      statusCodes: [...got.defaults.options.retry.statusCodes, 400],
    },
    hooks: {
      beforeRetry: [
        (options, error, retryCount) => {
          console.log(`🚨 Retrying ${retryCount} time(s)`);
        },
      ],
    },
    ...restOpts,
  }).then((res) => res.body);
};
