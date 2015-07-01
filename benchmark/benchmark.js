import testData from './test-data-1.js';
import {parse, matches} from '../abp-filter-parser.js';
import fs from 'fs';

var elapsed_time = function(start, note){
    var precision = 3; // 3 decimal places
    var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli
    console.log(process.hrtime(start)[0] + " s, " + elapsed.toFixed(precision) + " ms - " + note); // print message + time
    start = process.hrtime(); // reset the timer
}

fs.readFile('./test/data/easylist.txt', 'utf8', function (err, data) {
  if (err) {
    return console.log(err);
  }
  let parserData = {};
  parse(data, parserData);
  // Num lines minus (num empty lines + num comment lines)
  var start = process.hrtime();
  testData.forEach(([url, contentType, domain]) => {
    matches(parserData, url, {
      domain,
    });
  });
  elapsed_time(start, 'done');
});




