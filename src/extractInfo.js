import {parse, getFingerprint} from './abp-filter-parser.js';
import fs from 'fs';
import {BloomFilter} from 'bloom-filter-js';

console.log(getFingerprint('oauth.googleusercontent.com/gadgets/js/core:rpc:shindig.random:shindig.sha1.js?c=2'));


function discoverMatchingPrefix(bloomFilter, str, prefixLen = 8) {
  if (!bloomFilter.substringExists(str, prefixLen)) {
    console.log('no substring exists for url:', str);
  }
  for (var i = 0; i < str.length - prefixLen + 1; i++) {
    let sub = str.substring(i, i + prefixLen);
    let cleaned = sub.replace(/^https?:\/\//, '');
    if (bloomFilter.exists(cleaned)) {
      console.log('bad-fingerprint:', sub, 'for url:', str);
    }
  }
}

let sitesToCheck = [
  'http://c.s-microsoft.com/en-ca/CMSImages/store_symbol.png?version=e2eecca5-4550-10c6-57b1-5114804a4c01',
];

fs.readFile('./test/data/easylist.txt', 'utf8', function (err,data) {
  if (err) {
    return console.log(err);
  }

  let parserData = {};
  parse(data, parserData);

  // Write out the bloom filter data files
  fs.writeFileSync('dist/bloomFilterData', new Buffer(new Uint8Array(parserData.bloomFilter.toJSON())));
  fs.writeFileSync('dist/exceptionBloomFilterData', new Buffer(new Uint8Array(parserData.exceptionBloomFilter.toJSON())));

  let readData = fs.readFileSync('./dist/bloomFilterData');
  let bloomData = new BloomFilter(new Uint8Array(readData));
  console.log(bloomData);
  let bloomFilter = new BloomFilter(bloomData);

  //console.log('Number of filters processed: ', parserData.filterCount);


  console.log('-------');
  sitesToCheck.forEach(s =>
    discoverMatchingPrefix(bloomFilter/*parserData.bloomFilter*/, s));

  // WRite out the POD cached filter data JSM
  delete parserData.bloomFilter;
  delete parserData.exceptionBloomFilter;
  let cachedFilterDataJSM = 'dump("######Loaded cached-rules.jsm\\n");\nthis.EXPORTED_SYMBOLS = ["parserData"];\nthis.parserData = ' + JSON.stringify(parserData) + ';\n';
  fs.writeFileSync('cachedFilterData.jsm', cachedFilterDataJSM);
});
