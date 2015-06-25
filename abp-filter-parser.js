/*
var filterOptions = new Set([
  // Include or exclude JavaScript files.
  'script',
  // Include or exclude image files.
  'image',
  // Include or exclude stylesheets (CSS files).
  'stylesheet',
  // Include or exclude content handled by browser plugins like Flash
  // or Java.
  'object',
  // Include or exclude files loaded by browser plugins.
  'object-subrequest',
  // Include or exclude pages loaded within pages (frames).
  'subdocument',
  // Used to whitelist the page itself (e.g. @@||example.com^$document).
  'document',
  // Used to prevent element rules from applying on a page
  // (e.g. @@||example.com^$elemhide).
  'elemhide',
  // Specify a list of domains, separated by bar lines (|), on which a
  // filter should be active. A filter may be prevented from being activated
  // on a domain by preceding the domain name with a tilde (~).
  'domain=',
  // Specify whether a filter should be active on third-party or first domains.
  'third-party',
]);
*/

const separatorCharacters = ':?/=^';

function findFirstSeparatorChar(input, startPos) {
  for (let i = startPos; i < input.length; i++) {
    if (separatorCharacters.indexOf(input[i]) !== -1) {
      return i;
    }
  }
  return -1;
}

export function parseFilter(input, parsedFilterData) {
  input = input.trim();

  // Check for comment or nothing
  if (input.length === 0) {
    return false;
  }

  // Check for comments
  let beginIndex = 0;
  if (input[beginIndex] === '[' || input[beginIndex] === '!') {
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
      parsedFilterData.elementHiding = input.substring(beginIndex + index + 2);
      parsedFilterData.elementHidingException = input[beginIndex + index + 1] === '@';
    }
  }

  // Check for options, regex can have options too so check this before regex
  index = input.indexOf('$', beginIndex);
  if (index !== -1) {
    parsedFilterData.options = input.substring(beginIndex + index + 1).split(',');
    // Get rid of the trailing options for the rest of the parsing
    input = input.substring(0, index);
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
  return true;
}

export function parse(input) {
  let parserData = {
    filterCount: 0,
    filters: [],
    exceptionFilters: [],
  };

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
    if (parseFilter(filter, parsedFilterData)) {
      if (parsedFilterData.isException) {
        parserData.exceptionFilters.push(parsedFilterData);
      } else {
        parserData.filters.push(parsedFilterData);
      }
      parserData.filterCount++;
    }
    startPos = endPos + 1;
  }
  return parserData;
}

function getDomainIndex(input) {
  let index = input.indexOf(':');
  ++index;
  while (input[index] === '/') {
    index++;
  }
  return index;
}

// Similar to str1.indexOf(filter, startingPos) but with
// extra consideration to some ABP filter rules like ^
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

export function matchesFilter(parsedFilterData, input) {
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
    let domainIndexStart = getDomainIndex(input);
    let domainIndexEnd = findFirstSeparatorChar(input, domainIndexStart);
    if (domainIndexEnd === -1) {
      domainIndexEnd = input.length;
    }
    let inputHost = input.substring(domainIndexStart, domainIndexEnd);
    let matchIndex = inputHost.lastIndexOf(parsedFilterData.host);
    return (matchIndex === 0 || inputHost[matchIndex - 1] === '.') &&
      inputHost.length <= matchIndex + parsedFilterData.host.length &&
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

export function matches(parserData, input) {
  if (parserData.exceptionFilters.some((parsedFilterData) =>
      matchesFilter(parsedFilterData, input))) {
    return false;
  }

  return parserData.filters.some((parsedFilterData) =>
    matchesFilter(parsedFilterData, input));
}
