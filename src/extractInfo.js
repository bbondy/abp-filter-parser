import {parse, getFingerprint} from './abp-filter-parser.js';
import fs from 'fs';
let BloomFilter = require('bloom-filter-js');

function discoverMatchingPrefix(bloomFilter, str, prefixLen = 8) {
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

  // Write out the bloom filter data files
  fs.writeFileSync('bloomFilterData', new Buffer(new Uint8Array(parserData.bloomFilter.toJSON())));
  fs.writeFileSync('hostBloomFilterData', new Buffer(new Uint8Array(parserData.hostBloomFilter.toJSON())));
  fs.writeFileSync('exceptionBloomFilterData', new Buffer(new Uint8Array(parserData.exceptionBloomFilter.toJSON())));

  //console.log('Number of filters processed: ', parserData.filterCount);

  let readData = new Uint8Array(fs.readFileSync('bloomData'));
  let bloomFilter2 = new BloomFilter();

  console.log('-------');
  sitesToCheck.forEach(s =>
    discoverMatchingPrefix(parserData.bloomFilter, s));
});
