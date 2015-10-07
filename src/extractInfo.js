import {parse, getFingerprint} from './abp-filter-parser.js';
import fs from 'fs';

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
  'http://static.digg.com/static/fe/229ff0/images/reader/top-setting@2x.png'
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

  console.log('-------');
  sitesToCheck.forEach(s =>
    discoverMatchingPrefix(parserData.bloomFilter, s));

  // WRite out the POD cached filter data JSM
  delete parserData.bloomFilter;
  delete parserData.hostBloomFilter;
  delete parserData.exceptionBloomFilter;
  let cachedFilterDataJSM = 'dump("######Loaded cached-rules.jsm\\n");\nthis.EXPORTED_SYMBOLS = ["parserData"];\nthis.parserData = ' + JSON.stringify(parserData) + ';\n';
  fs.writeFileSync('cachedFilterData.jsm', cachedFilterDataJSM);
});
