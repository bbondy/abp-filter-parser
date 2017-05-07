import * as BloomFilterJS from 'bloom-filter-js';
import {badFingerprints, badSubstrings} from './badFingerprints.js';

let fs = require('fs');

/**
 * bitwise mask of different request types
 */
export const elementTypes = {
  SCRIPT: 0o1,
  IMAGE: 0o2,
  STYLESHEET: 0o4,
  OBJECT: 0o10,
  XMLHTTPREQUEST: 0o20,
  OBJECTSUBREQUEST: 0o40,
  SUBDOCUMENT: 0o100,
  DOCUMENT: 0o200,
  OTHER: 0o400,
};

// Maximum number of cached entries to keep for subsequent lookups
const maxCached = 100;

// Maximum number of URL chars to check in match clauses
const maxUrlChars = 100;

// Exact size for fingerprints, if you change also change fingerprintRegexs
const fingerprintSize = 8;

// Regexes used to create fingerprints
// There's more than one because sometimes a fingerprint is determined to be a bad
// one and would lead to a lot of collisions in the bloom filter). In those cases
// we use the 2nd fingerprint.
let fingerprintRegexs = [
  /.*([./&_\-=a-zA-Z0-9]{8})\$?.*/,
  /([./&_\-=a-zA-Z0-9]{8})\$?.*/,
];

/**
 * Maps element types to type mask.
 */
export const elementTypeMaskMap = new Map([
  ['script', elementTypes.SCRIPT],
  ['image', elementTypes.IMAGE],
  ['stylesheet', elementTypes.STYLESHEET],
  ['object', elementTypes.OBJECT],
  ['xmlhttprequest', elementTypes.XMLHTTPREQUEST],
  ['object-subrequest', elementTypes.OBJECTSUBREQUEST],
  ['subdocument', elementTypes.SUBDOCUMENT],
  ['document', elementTypes.DOCUMENT],
  ['other', elementTypes.OTHER]
]);

const separatorCharacters = ':?/=^';

/**
 * Parses the domain string using the passed in separator and
 * fills in options.
 */
export function parseDomains(input, separator, options) {
  options.domains = options.domains || [];
  options.skipDomains = options.skipDomains || [];
  let domains = input.split(separator);
  options.domains = options.domains.concat(domains.filter((domain) => domain[0] !== '~'));
  options.skipDomains = options.skipDomains.concat(domains
    .filter((domain) => domain[0] === '~')
    .map((domain) => domain.substring(1)));
}

if (!Array.prototype.includes) {
  Array.prototype.includes = function(searchElement /*, fromIndex*/ ) {
    'use strict';
    var O = Object(this);
    var len = parseInt(O.length, 10) || 0;
    if (len === 0) {
      return false;
    }
    var n = parseInt(arguments[1], 10) || 0;
    var k;
    if (n >= 0) {
      k = n;
    } else {
      k = len + n;
      if (k < 0) {k = 0;}
    }
    var currentElement;
    while (k < len) {
      currentElement = O[k];
      if (searchElement === currentElement ||
         (searchElement !== searchElement && currentElement !== currentElement)) { // NaN !== NaN
        return true;
      }
      k++;
    }
    return false;
  };
}


/**
 * Parses options from the passed in input string
 */
export function parseOptions(input) {
  let output = {
    binaryOptions: new Set(),
  };
  input.split(',').forEach((option) => {
    option = option.trim();
    if (option.startsWith('domain=')) {
      let domainString = option.split('=')[1].trim();
      parseDomains(domainString, '|', output);
    } else {
      let optionWithoutPrefix = option[0] === '~' ? option.substring(1) : option;
      if (elementTypeMaskMap.has(optionWithoutPrefix)) {
        if (option[0] === '~') {
          output.skipElementTypeMask |= elementTypeMaskMap.get(optionWithoutPrefix);
        } else {
          output.elementTypeMask |= elementTypeMaskMap.get(optionWithoutPrefix);
        }
      }
      output.binaryOptions.add(option);
    }
  });
  return output;
}

/**
 * Finds the first separator character in the input string
 */
function findFirstSeparatorChar(input, startPos) {
  for (let i = startPos; i < input.length; i++) {
    if (separatorCharacters.indexOf(input[i]) !== -1) {
      return i;
    }
  }
  return -1;
}

/**
 * Parses an HTML filter and modifies the passed in parsedFilterData
 * as necessary.
 *
 * @param input: The entire input string to consider
 * @param index: Index of the first hash
 * @param parsedFilterData: The parsedFilterData object to fill
 */
export function parseHTMLFilter(input, index, parsedFilterData) {
  let domainsStr = input.substring(0, index);
  parsedFilterData.options = {};
  if (domainsStr.length > 0) {
    parseDomains(domainsStr, ',', parsedFilterData.options);
  }

  // The XOR parsedFilterData.elementHidingException is in case the rule already
  // was specified as exception handling with a prefixed @@
  parsedFilterData.isException = !!(input[index + 1] === '@' ^
    parsedFilterData.isException);
  if (input[index + 1] === '@') {
    // Skip passed the first # since @# is 2 chars same as ##
    index++;
  }
  parsedFilterData.htmlRuleSelector = input.substring(index + 2);
}

export function parseFilter(input, parsedFilterData, bloomFilter, exceptionBloomFilter) {
  input = input.trim();
  parsedFilterData.rawFilter = input;

  // Check for comment or nothing
  if (input.length === 0) {
    return false;
  }

  // Check for comments
  let beginIndex = 0;
  if (input[beginIndex] === '[' || input[beginIndex] === '!') {
    parsedFilterData.isComment = true;
    return false;
  }

  // Check for exception instead of filter
  parsedFilterData.isException = input[beginIndex] === '@' &&
    input[beginIndex + 1] === '@';
  if (parsedFilterData.isException) {
    beginIndex = 2;
  }

  // Check for element hiding rules
  let index = input.indexOf('#', beginIndex);
  if (index !== -1) {
    if (input[index + 1] === '#' || input[index + 1] === '@') {
      parseHTMLFilter(input.substring(beginIndex), index - beginIndex, parsedFilterData);
      // HTML rules cannot be combined with other parsing,
      // other than @@ exception marking.
      return true;
    }
  }

  // Check for options, regex can have options too so check this before regex
  index = input.indexOf('$', beginIndex);
  if (index !== -1) {
    parsedFilterData.options = parseOptions(input.substring(index + 1));
    // Get rid of the trailing options for the rest of the parsing
    input = input.substring(0, index);
  } else {
    parsedFilterData.options = {};
  }

  // Check for a regex
  parsedFilterData.isRegex = input[beginIndex] === '/' &&
    input[input.length - 1] === '/' && beginIndex !== input.length - 1;
  if (parsedFilterData.isRegex) {
    parsedFilterData.data = input.slice(beginIndex + 1, -1);
    return true;
  }

  // Check if there's some kind of anchoring
  if (input[beginIndex] === '|') {
    // Check for an anchored domain name
    if (input[beginIndex + 1] === '|') {
      parsedFilterData.hostAnchored = true;
      let indexOfSep = findFirstSeparatorChar(input, beginIndex + 1);
      if (indexOfSep === -1) {
        indexOfSep = input.length;
      }
      beginIndex += 2;
      parsedFilterData.host = input.substring(beginIndex, indexOfSep);
    } else {
      parsedFilterData.leftAnchored = true;
      beginIndex++;
    }
  }
  if (input[input.length - 1] === '|') {
    parsedFilterData.rightAnchored = true;
    input = input.substring(0, input.length - 1);
  }

  parsedFilterData.data = input.substring(beginIndex) || '*';
  // Use the host bloom filter if the filter is a host anchored filter rule with no other data
  if (exceptionBloomFilter && parsedFilterData.isException) {
    exceptionBloomFilter.add(getFingerprint(parsedFilterData.data));
  } else if (bloomFilter) {
    // To check for duplicates
    //if (bloomFilter.exists(getFingerprint(parsedFilterData.data))) {
      // console.log('duplicate found for data: ' + getFingerprint(parsedFilterData.data));
    //}
    // console.log('parse:', parsedFilterData.data, 'fingerprint:', getFingerprint(parsedFilterData.data));
    bloomFilter.add(getFingerprint(parsedFilterData.data));
  }

  return true;
}

/**
 * Parses the set of filter rules and fills in parserData
 * @param input filter rules
 * @param parserData out parameter which will be filled
 *   with the filters, exceptionFilters and htmlRuleFilters.
 */
export function parse(input, parserData) {
  parserData.bloomFilter = parserData.bloomFilter || new BloomFilterJS.BloomFilter();
  parserData.exceptionBloomFilter = parserData.exceptionBloomFilter || new BloomFilterJS.BloomFilter();
  parserData.filters = parserData.filters || [];
  parserData.noFingerprintFilters = parserData.noFingerprintFilters || [];
  parserData.exceptionFilters = parserData.exceptionFilters || [];
  parserData.noFingerprintExceptionFilters = parserData.noFingerprintExceptionFilters || [];
  parserData.htmlRuleFilters = parserData.htmlRuleFilters || [];
  let startPos = 0;
  let endPos = input.length;
  let newline = '\n';
  while (startPos <= input.length) {
    endPos = input.indexOf(newline, startPos);
    if (endPos === -1) {
      newline = '\r';
      endPos = input.indexOf(newline, startPos);
    }
    if (endPos === -1) {
      endPos = input.length;
    }
    let filter = input.substring(startPos, endPos);
    let parsedFilterData = {};
    if (parseFilter(filter, parsedFilterData, parserData.bloomFilter, parserData.exceptionBloomFilter)) {
      let fingerprint = getFingerprint(parsedFilterData.data);
      if (parsedFilterData.htmlRuleSelector) {
        parserData.htmlRuleFilters.push(parsedFilterData);
      } else if (parsedFilterData.isException) {
        if (fingerprint.length > 0) {
          parserData.exceptionFilters.push(parsedFilterData);
        } else {
          parserData.noFingerprintExceptionFilters.push(parsedFilterData);
        }
      } else {
        if (fingerprint.length > 0) {
          parserData.filters.push(parsedFilterData);
        } else {
          parserData.noFingerprintFilters.push(parsedFilterData);
        }
      }
    }
    startPos = endPos + 1;
  }
}

/**
 * Obtains the domain index of the input filter line
 */
function getDomainIndex(input) {
  let index = input.indexOf(':');
  ++index;
  while (input[index] === '/') {
    index++;
  }
  return index;
}

/**
 * Similar to str1.indexOf(filter, startingPos) but with
 * extra consideration to some ABP filter rules like ^.
 */
function indexOfFilter(input, filter, startingPos) {
  if (filter.length > input.length) {
    return -1;
  }

  let filterParts = filter.split('^');
  let index = startingPos;
  let beginIndex = -1;
  let prefixedSeparatorChar = false;

  for (let f = 0; f < filterParts.length; f++) {
    if (filterParts[f] === '') {
      prefixedSeparatorChar = true;
      continue;
    }

    index = input.indexOf(filterParts[f], index);
    if (index === -1) {
      return -1;
    }
    if (beginIndex === -1) {
      beginIndex = index;
    }

    if (prefixedSeparatorChar) {
      if (separatorCharacters.indexOf(input[index - 1]) === -1) {
        return -1;
      }
    }
    // If we are in an in between filterPart
    if (f + 1 < filterParts.length &&
        // and we have some chars left in the input past the last filter match
        input.length > index + filterParts[f].length) {
      if (separatorCharacters.indexOf(input[index + filterParts[f].length]) === -1) {
        return -1;
      }

    }

    prefixedSeparatorChar = false;
  }
  return beginIndex;
}

function getUrlHost(input) {
  let domainIndexStart = getDomainIndex(input);
  let domainIndexEnd = findFirstSeparatorChar(input, domainIndexStart);
  if (domainIndexEnd === -1) {
    domainIndexEnd = input.length;
  }
  return input.substring(domainIndexStart, domainIndexEnd);
}

function filterDataContainsOption(parsedFilterData, option) {
  return parsedFilterData.options &&
    parsedFilterData.options.binaryOptions &&
    parsedFilterData.options.binaryOptions.has(option);
}

function isThirdPartyHost(baseContextHost, testHost) {
  if (!testHost.endsWith(baseContextHost)) {
    return true;
  }

  let c = testHost[testHost.length - baseContextHost.length - 1];
  return c !== '.' && c !== undefined;
}

// Determines if there's a match based on the options, this doesn't
// mean that the filter rule shoudl be accepted, just that the filter rule
// should be considered given the current context.
// By specifying context params, you can filter out the number of rules which are
// considered.
function matchOptions(parsedFilterData, input, contextParams = {}) {
  if (contextParams.elementTypeMask !== undefined && parsedFilterData.options) {
    if (parsedFilterData.options.elementTypeMask !== undefined &&
        !(parsedFilterData.options.elementTypeMask & contextParams.elementTypeMask)) {
      return false;
    } if (parsedFilterData.options.skipElementTypeMask !== undefined &&
          parsedFilterData.options.skipElementTypeMask & contextParams.elementTypeMask) {
      return false;
    }
  }

  // Domain option check
  if (contextParams.domain !== undefined && parsedFilterData.options) {
    if (parsedFilterData.options.domains || parsedFilterData.options.skipDomains) {
      // Get the domains that should be considered
      let shouldBlockDomains = parsedFilterData.options.domains.filter((domain) =>
        !isThirdPartyHost(domain, contextParams.domain));

      let shouldSkipDomains = parsedFilterData.options.skipDomains.filter((domain) =>
        !isThirdPartyHost(domain, contextParams.domain));
      // Handle cases like: example.com|~foo.example.com should llow for foo.example.com
      // But ~example.com|foo.example.com should block for foo.example.com
      let leftOverBlocking = shouldBlockDomains.filter((shouldBlockDomain) =>
        shouldSkipDomains.every((shouldSkipDomain) =>
          isThirdPartyHost(shouldBlockDomain, shouldSkipDomain)));
      let leftOverSkipping = shouldSkipDomains.filter((shouldSkipDomain) =>
        shouldBlockDomains.every((shouldBlockDomain) =>
          isThirdPartyHost(shouldSkipDomain, shouldBlockDomain)));

      // If we have none left over, then we shouldn't consider this a match
      if (shouldBlockDomains.length === 0 && parsedFilterData.options.domains.length !== 0 ||
          shouldBlockDomains.length > 0 && leftOverBlocking.length === 0 ||
          shouldSkipDomains.length > 0 && leftOverSkipping.length > 0) {
        return false;
      }
    }
  }

  // If we're in the context of third-party site, then consider third-party option checks
  if (contextParams['third-party'] !== undefined) {
    // Is the current rule check for third party only?
    if (filterDataContainsOption(parsedFilterData, 'third-party')) {
      let inputHost = getUrlHost(input);
      let inputHostIsThirdParty = isThirdPartyHost(parsedFilterData.host, inputHost);
      if (inputHostIsThirdParty || !contextParams['third-party']) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Given an individual parsed filter data determines if the input url should block.
 */
export function matchesFilter(parsedFilterData, input, contextParams = {}, cachedInputData = {}) {
  if (!matchOptions(parsedFilterData, input, contextParams)) {
    return false;
  }

  // For HTML rule selector filters, consider them as matches as long as the
  // filter options match. This allows us to use this function, for example,
  // to check whether an HTML rule selector filter applies to a domain or not
  if (parsedFilterData.htmlRuleSelector) {
    return true;
  }

  // Check for a regex match
  if (parsedFilterData.isRegex) {
    if (!parsedFilterData.regex) {
      parsedFilterData.regex = new RegExp(parsedFilterData.data);
    }
    return parsedFilterData.regex.test(input);
  }

  // Check for both left and right anchored
  if (parsedFilterData.leftAnchored && parsedFilterData.rightAnchored) {
    return parsedFilterData.data === input;
  }

  // Check for right anchored
  if (parsedFilterData.rightAnchored) {
    return input.slice(-parsedFilterData.data.length) === parsedFilterData.data;
  }

  // Check for left anchored
  if (parsedFilterData.leftAnchored) {
    return input.substring(0, parsedFilterData.data.length) === parsedFilterData.data;
  }

  // Check for domain name anchored
  if (parsedFilterData.hostAnchored) {
    if (!cachedInputData.currentHost) {
      cachedInputData.currentHost = getUrlHost(input);
    }

    return !isThirdPartyHost(parsedFilterData.host, cachedInputData.currentHost) &&
      indexOfFilter(input, parsedFilterData.data) !== -1;
  }

  // Wildcard match comparison
  let parts = parsedFilterData.data.split('*');
  let index = 0;
  for (let part of parts) {
    let newIndex = indexOfFilter(input, part, index);
    if (newIndex === -1) {
      return false;
    }
    index = newIndex + part.length;
  }

  return true;
}

function discoverMatchingPrefix(array, bloomFilter, str, prefixLen = fingerprintSize) {
  for (var i = 0; i < str.length - prefixLen + 1; i++) {
    let sub = str.substring(i, i + prefixLen);
    if (bloomFilter.exists(sub)) {
      array.push({ badFingerprint: sub, src: str});
      // console.log('bad-fingerprint:', sub, 'for url:', str);
    } else {
      // console.log('good-fingerprint:', sub, 'for url:', str);
    }
  }
}

function hasMatchingFilters(filterList, parsedFilterData, input, contextParams, cachedInputData) {
  const foundFilter = filterList.find(parsedFilterData2 =>
    matchesFilter(parsedFilterData2, input, contextParams, cachedInputData));
  if (foundFilter && cachedInputData.matchedFilters && foundFilter.rawFilter) {

    // increment the count of matches
    // we store an extra object and a count so that in the future
    // other bits of information can be recorded during match time
    if (cachedInputData.matchedFilters[foundFilter.rawFilter]) {
      cachedInputData.matchedFilters[foundFilter.rawFilter].matches += 1;
    } else {
      cachedInputData.matchedFilters[foundFilter.rawFilter]  = { matches: 1 };
    }

    fs.writeFileSync('easylist-matches.json', JSON.stringify(cachedInputData.matchedFilters), 'utf-8');
  }
  return !!foundFilter;
}

/**
 * Using the parserData rules will try to see if the input URL should be blocked or not
 * @param parserData The filter data obtained from a call to parse
 * @param input The input URL
 * @return true if the URL should be blocked
 */
export function matches(parserData, input, contextParams = {}, cachedInputData = { }) {
  cachedInputData.bloomNegativeCount = cachedInputData.bloomNegativeCount || 0;
  cachedInputData.bloomPositiveCount = cachedInputData.bloomPositiveCount || 0;
  cachedInputData.notMatchCount = cachedInputData.notMatchCount || 0;
  cachedInputData.badFingerprints = cachedInputData.badFingerprints || [];
  cachedInputData.matchedFilters = cachedInputData.matchedFilters || {};

  cachedInputData.bloomFalsePositiveCount = cachedInputData.bloomFalsePositiveCount || 0;
  let hasMatchingNoFingerprintFilters;
  let cleanedInput = input;
  if (cleanedInput.length > maxUrlChars) {
    cleanedInput = cleanedInput.substring(0, maxUrlChars);
  }
  if (parserData.bloomFilter) {
    if (!parserData.bloomFilter.substringExists(cleanedInput, fingerprintSize)) {
      cachedInputData.bloomNegativeCount++;
      cachedInputData.notMatchCount++;
      // console.log('early return because of bloom filter check!');
      hasMatchingNoFingerprintFilters =
        hasMatchingFilters(parserData.noFingerprintFilters, parserData, input, contextParams, cachedInputData);

      if (!hasMatchingNoFingerprintFilters) {
        return false;
      }
    }
    // console.log('looked for url in bloom filter and it said yes:', cleaned);
  }
  cachedInputData.bloomPositiveCount++;

  // console.log('not early return: ', input);
  delete cachedInputData.currentHost;
  cachedInputData.misses = cachedInputData.misses || new Set();
  cachedInputData.missList = cachedInputData.missList || [];
  if (cachedInputData.missList.length > maxCached) {
    cachedInputData.misses.delete(cachedInputData.missList[0]);
    cachedInputData.missList = cachedInputData.missList.splice(1);
  }
  if (cachedInputData.misses.has(input)) {
    cachedInputData.notMatchCount++;
    // console.log('positive match for input: ', input);
    return false;
  }

  if (hasMatchingFilters(parserData.filters, parserData, input, contextParams, cachedInputData) ||
      hasMatchingNoFingerprintFilters === true || hasMatchingNoFingerprintFilters === undefined &&
      hasMatchingFilters(parserData.noFingerprintFilters, parserData, input, contextParams, cachedInputData)) {
    // Check for exceptions only when there's a match because matches are
    // rare compared to the volume of checks
    let exceptionBloomFilterMiss = parserData.exceptionBloomFilter && !parserData.exceptionBloomFilter.substringExists(cleanedInput, fingerprintSize);
    if (!exceptionBloomFilterMiss && hasMatchingFilters(parserData.exceptionFilters, parserData, input, contextParams, cachedInputData) ||
        hasMatchingFilters(parserData.noFingerprintExceptionFilters, parserData, input, contextParams, cachedInputData)) {
      cachedInputData.notMatchCount++;
      return false;
    }
    return true;
  }

  // The bloom filter had a false positive, se we checked for nothing! :'(
  // This is probably (but not always) an indication that the fingerprint selection should be tweaked!
  cachedInputData.missList.push(input);
  cachedInputData.misses.add(input);
  cachedInputData.notMatchCount++;
  cachedInputData.bloomFalsePositiveCount++;
  discoverMatchingPrefix(cachedInputData.badFingerprints, parserData.bloomFilter, cleanedInput);
  // console.log('positive match for input: ', input);
  return false;
}

/**
 * Obtains a fingerprint for the specified filter
 */
export function getFingerprint(str) {
  for (var i = 0; i < fingerprintRegexs.length; i++) {
    let fingerprintRegex = fingerprintRegexs[i];
    let result = fingerprintRegex.exec(str);
    fingerprintRegex.lastIndex = 0;

    if (result &&
        !badFingerprints.includes(result[1]) &&
        !badSubstrings.find(badSubstring => result[1].includes(badSubstring))) {
      return result[1];
    }
    if (result) {
      // console.log('checking again for str:', str, 'result:', result[1]);
    } else {
      // console.log('checking again for str, no result');
    }
  }
  // This is pretty ugly but getting fingerprints is assumed to be used only when preprocessing and
  // in a live environment.
  if (str.length > 8) {
    // Remove first and last char
    return getFingerprint(str.slice(1, -1));
  }
  // console.warn('Warning: Could not determine a good fingerprint for:', str);
  return '';
}
