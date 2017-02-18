/* eslint-disable no-console */
'use strict';

module.exports = (name, withCache, callback) => {
  let s;

  const logs = [];
  logs.push(`node: ${process.uptime() * 1000}ms`);

  if (withCache) {
    s = Date.now();
    require('../v8-compile-cache');
    logs.push(`require-cache: ${Date.now() - s}ms`);
  }

  s = Date.now();
  callback();
  logs.push(`${name}: ${Date.now() - s}ms`);

  s = Date.now();
  process.on('exit', () => {
    logs.push(`exit: ${Date.now() - s}ms`);
    logs.push(`total: ${process.uptime() * 1000}ms`);
    console.log(logs.join('\t'));
  });
};
