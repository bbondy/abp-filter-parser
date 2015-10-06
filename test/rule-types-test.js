import assert from 'assert';
import {parseFilter} from '../src/abp-filter-parser.js';

let commentRules = new Set([
   '[Adblock Plus 2.0]',
    '! Checksum: nVIXktYXKU6M+cu+Txkhuw',
    '!/cb.php?sub$script,third-party',
    '!@@/cb.php?sub',
    '!###ADSLOT_SKYSCRAPER',
    '! *** easylist:easylist/easylist_whitelist_general_hide.txt ***',
    '   !###ADSLOT_SKYSCRAPER',
]);

let elementHidingRules = new Set([
  '   ###ADSLOT_SKYSCRAPER',
  '###ADSLOT_SKYSCRAPER',
  '@@###ADSLOT_SKYSCRAPER',
  '##.adsBox',
  'eee.se#@##adspace_top',
  'domain1.com,domain2.com#@##adwrapper',
  'edgesuitedomain.net#@##ad-unit',
  'mydomain.com#@#.ad-unit',
  '##a[href^=\'http://affiliate.sometracker.com/\']',
]);

describe('rule-types#parse()', function(){
  it('rule types should be properly detected', function(){
    commentRules.forEach(commentRule => {
      let parsedFilterData = {};
      parseFilter(commentRule, parsedFilterData);
      assert(parsedFilterData.isComment, `${commentRule} should be marked as a comment`);
    });
    elementHidingRules.forEach(elementHidingRule => {
      let parsedFilterData = {};
      parseFilter(elementHidingRule, parsedFilterData);
      assert(parsedFilterData.htmlRuleSelector.length > 0);
      assert(parsedFilterData.isException !== undefined);
    });
  });
});
