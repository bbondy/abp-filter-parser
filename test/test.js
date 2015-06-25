import assert from 'assert';
import {parse} from '../abp-filter-parser.js';
import fs from 'fs';

describe('#parse()', function(){
  it('should parse EasyList without failing', function(cb){
    fs.readFile('./test/data/easylist.txt', 'utf8', function (err,data) {
      if (err) {
        return console.log(err);
      }
      let parserData = parse(data);
      // Num lines minus (num empty lines + num comment lines)
      assert.equal(parserData.filterCount, 47536);
      cb();
    });
  })
});
