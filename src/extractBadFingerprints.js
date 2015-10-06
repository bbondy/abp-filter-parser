import {parse, getFingerprint} from './abp-filter-parser.js';
import fs from 'fs';
let BloomFilter = require('bloom-filter-js');

function discoverMatchinPrefix(bloomFilter, str, prefixLen = 8) {
  for (var i = 0; i < str.length - prefixLen + 1; i++) {
    let sub = str.substring(i, i + prefixLen);
    let cleaned = sub.replace(/^https?:\/\//, '');
    if (bloomFilter.exists(cleaned)) {
      console.log('bad-fingerprint:', sub, 'for url:', str);
    }
  }
}

let sitesToCheck = [
  'http://www.walmart.com/canadaredirect.html',
];

fs.readFile('./test/data/easylist.txt', 'utf8', function (err,data) {
  if (err) {
    return console.log(err);
  }

  let parserData = {};
  parse(data, parserData);

  //console.log('Number of filters processed: ', parserData.filterCount);
  let bloomFilterData = new Uint8Array(parserData.bloomFilter.toJSON());
  fs.writeFileSync('bloomData', new Buffer(bloomFilterData));

  let readData = new Uint8Array(fs.readFileSync('bloomData'));
  let bloomFilter2 = new BloomFilter();

  console.log('-------');
  sitesToCheck.forEach(s =>
    discoverMatchinPrefix(parserData.bloomFilter, s));
});
