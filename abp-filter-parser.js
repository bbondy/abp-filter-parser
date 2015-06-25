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

export function parseFilter(input, parsedFilterData) {
  // Check for comment or nothing
  if (input.length === 0) {
    return false;
  }

  // Check for comments
  let beginIndex = 0;
  if (input[beginIndex] === '[' || input[beginIndex] === '!') {
    return false;
  }

  // We'll likely want to store the filter rule at this point
  input = input.trim();

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
    input[input.length -1] === '/' && beginIndex !== input.length -1;
  if (parsedFilterData.isRegex) {
    parsedFilterData.data = input.slice(beginIndex + 1, -1);
    return true;
  }

  // Check if there's some kind of anchoring
  if (input[beginIndex] === '|') {
    // Check for an anchored domain name
    if (input[beginIndex + 1] === '|') {
      parsedFilterData.domainNameAnchor = true;
      beginIndex += 2;
    } else {
      parsedFilterData.leftAnchored = true;
      beginIndex++;
    }
  }
  if (input[input.length - 1] === '|') {
    parsedFilterData.rightAnchored = true;
    input = input.substring(0, input.length - 1);
  }

  // Replace separators with * for easier parsing (will probably refactor later)
  input = input.replace(/\^/g, '*');

  parsedFilterData.data = input.substring(beginIndex) || '*';
  return true;
}

export function parse(input) {
  let parserData = {
    filterCount: 0,
    parsedFilters: [],
  };

  let startPos = 0;
  let endPos = input.length;
  while (startPos !== input.length) {
    endPos = input.indexOf('\n', startPos);
    if (endPos === -1) {
      endPos = input.length;
    }
    let filter = input.substring(startPos, endPos);
    let parsedFilterData = {};
    if (parseFilter(filter, parsedFilterData)) {
      parserData.parsedFilters.push(parsedFilterData);
      parserData.filterCount++;
    }
    startPos = endPos + 1;
  }
  return parserData;
}

export function matchesFilter(parsedFilterData, input) {
  if (parsedFilterData.isRegex) {
    if (!parsedFilterData.regex) {
      parsedFilterData.regex = new RegExp(parsedFilterData.data);
    }
    return parsedFilterData.regex.test(input);
  }

  return true;
}
