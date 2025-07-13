
// Courtesy of Claude :)

const atRules = new Set([
    'charset', 'import', 'namespace', 'media', 'supports', 'page', 'font-face',
    'keyframes', 'counter-style', 'font-feature-values', 'property', 'layer',
    'container', 'scope'
]);

const pseudoClasses = new Set([
    'hover', 'focus', 'active', 'visited', 'link', 'disabled', 'enabled',
    'checked', 'first-child', 'last-child', 'nth-child', 'nth-last-child',
    'first-of-type', 'last-of-type', 'nth-of-type', 'nth-last-of-type',
    'only-child', 'only-of-type', 'empty', 'root', 'target', 'not', 'is',
    'where', 'has', 'focus-within', 'focus-visible'
]);

const pseudoElements = new Set([
    'before', 'after', 'first-line', 'first-letter', 'selection', 'backdrop',
    'placeholder', 'marker', 'file-selector-button'
]);

const properties = new Set([
    'display', 'position', 'top', 'right', 'bottom', 'left', 'width', 'height',
    'margin', 'padding', 'border', 'background', 'color', 'font', 'text',
    'flex', 'grid', 'transform', 'transition', 'animation', 'opacity',
    'visibility', 'overflow', 'z-index', 'content', 'cursor', 'pointer-events'
]);

const units = new Set([
    'px', 'em', 'rem', 'ex', 'ch', 'vw', 'vh', 'vmin', 'vmax', '%',
    'cm', 'mm', 'in', 'pt', 'pc', 'deg', 'rad', 'grad', 'turn',
    's', 'ms', 'hz', 'khz', 'dpi', 'dpcm', 'dppx', 'fr'
]);

const functions = new Set([
    'url', 'calc', 'min', 'max', 'clamp', 'var', 'rgb', 'rgba', 'hsl', 'hsla',
    'linear-gradient', 'radial-gradient', 'conic-gradient', 'repeating-linear-gradient',
    'repeating-radial-gradient', 'translate', 'rotate', 'scale', 'skew', 'matrix',
    'cubic-bezier', 'steps', 'attr', 'counter', 'counters'
]);

export function tokenize(code) {
    const tokens = [];
    let i = 0;

    while (i < code.length) {
        const char = code[i];

        // Whitespace
        if (/\s/.test(char)) {
            const start = i;
            while (i < code.length && /\s/.test(code[i])) i++;
            tokens.push({ type: 'whitespace', value: code.slice(start, i) });
            continue;
        }

        // Comments
        if (char === '/' && code[i + 1] === '*') {
            const start = i;
            i += 2;
            while (i < code.length - 1 && !(code[i] === '*' && code[i + 1] === '/')) i++;
            if (i < code.length - 1) i += 2;
            tokens.push({ type: 'comment', value: code.slice(start, i) });
            continue;
        }

        // Strings
        if (char === '"' || char === "'") {
            const stringToken = tokenizeString(code, i, char);
            tokens.push(stringToken.token);
            i = stringToken.newIndex;
            continue;
        }

        // URL function special case
        if (char === 'u' && code.slice(i, i + 4) === 'url(') {
            const urlToken = tokenizeUrl(code, i);
            if (urlToken) {
                tokens.push(urlToken.token);
                i = urlToken.newIndex;
                continue;
            }
        }

        // At-rules
        if (char === '@') {
            const atRuleToken = tokenizeAtRule(code, i);
            tokens.push(atRuleToken.token);
            i = atRuleToken.newIndex;
            continue;
        }

        // Numbers (including units)
        if (/\d/.test(char) || (char === '.' && /\d/.test(code[i + 1]))) {
            const numberToken = tokenizeNumber(code, i);
            tokens.push(numberToken.token);
            i = numberToken.newIndex;
            continue;
        }

        // Hash values (colors, IDs)
        if (char === '#') {
            const hashToken = tokenizeHash(code, i);
            tokens.push(hashToken.token);
            i = hashToken.newIndex;
            continue;
        }

        // Identifiers, properties, values
        if (/[a-zA-Z_-]/.test(char)) {
            const identifierToken = tokenizeIdentifier(code, i);
            tokens.push(identifierToken.token);
            i = identifierToken.newIndex;
            continue;
        }

        // CSS variables
        if (char === '-' && code[i + 1] === '-') {
            const variableToken = tokenizeVariable(code, i);
            tokens.push(variableToken.token);
            i = variableToken.newIndex;
            continue;
        }

        // Pseudo-classes and pseudo-elements
        if (char === ':') {
            const pseudoToken = tokenizePseudo(code, i);
            tokens.push(pseudoToken.token);
            i = pseudoToken.newIndex;
            continue;
        }

        // Operators and punctuation
        if ('{}[](),.;:>+~*|^$='.includes(char)) {
            // Handle multi-character operators
            const twoChar = code.slice(i, i + 2);
            if (['~=', '|=', '^=', '$=', '*='].includes(twoChar)) {
                tokens.push({ type: 'operator', value: twoChar });
                i += 2;
                continue;
            }

            const type = '{}[]()'.includes(char) ? 'punctuation' :
                        ',;'.includes(char) ? 'delimiter' : 'operator';
            tokens.push({ type, value: char });
            i++;
            continue;
        }

        // Important declaration
        if (char === '!') {
            const importantToken = tokenizeImportant(code, i);
            if (importantToken) {
                tokens.push(importantToken.token);
                i = importantToken.newIndex;
                continue;
            }
        }

        // Unknown character
        tokens.push({ type: 'unknown', value: char });
        i++;
    }

    return tokens;
}

function tokenizeString(code, start, quote) {
    let i = start;
    let value = '';

    value += code[i++]; // Opening quote

    while (i < code.length) {
        const char = code[i];

        if (char === quote) {
            value += char;
            i++;
            break;
        }

        if (char === '\\') {
            value += char;
            i++;
            if (i < code.length) {
                value += code[i];
                i++;
            }
            continue;
        }

        value += char;
        i++;
    }

    return { token: { type: 'string', value }, newIndex: i };
}

function tokenizeUrl(code, start) {
    let i = start + 4; // Skip 'url('
    let value = 'url(';

    // Skip whitespace
    while (i < code.length && /\s/.test(code[i])) {
        value += code[i++];
    }

    // Handle quoted URLs
    if (code[i] === '"' || code[i] === "'") {
        const quote = code[i];
        value += code[i++];
        while (i < code.length && code[i] !== quote) {
            if (code[i] === '\\') {
                value += code[i++];
                if (i < code.length) value += code[i++];
            } else {
                value += code[i++];
            }
        }
        if (i < code.length) value += code[i++]; // Closing quote
    } else {
        // Unquoted URL
        while (i < code.length && code[i] !== ')' && !/\s/.test(code[i])) {
            value += code[i++];
        }
    }

    // Skip whitespace
    while (i < code.length && /\s/.test(code[i])) {
        value += code[i++];
    }

    if (i < code.length && code[i] === ')') {
        value += code[i++];
    }

    return { token: { type: 'url', value }, newIndex: i };
}

function tokenizeAtRule(code, start) {
    let i = start + 1; // Skip @
    let value = '@';

    while (i < code.length && /[a-zA-Z-]/.test(code[i])) {
        value += code[i++];
    }

    const ruleName = value.slice(1);
    const type = atRules.has(ruleName) ? 'at-rule' : 'unknown';

    return { token: { type, value }, newIndex: i };
}

function tokenizeNumber(code, start) {
    let i = start;
    let value = '';

    // Handle negative numbers
    if (code[i] === '-') {
        value += code[i++];
    }

    // Parse number part
    let hasDecimal = false;
    while (i < code.length && (/\d/.test(code[i]) || (code[i] === '.' && !hasDecimal))) {
        if (code[i] === '.') hasDecimal = true;
        value += code[i++];
    }

    // Check for unit
    const unitStart = i;
    while (i < code.length && /[a-zA-Z%]/.test(code[i])) {
        i++;
    }

    if (i > unitStart) {
        const unit = code.slice(unitStart, i);
        value += unit;
        const type = units.has(unit) ? 'number-unit' : 'unknown';
        return { token: { type, value }, newIndex: i };
    }

    return { token: { type: 'number', value }, newIndex: i };
}

function tokenizeHash(code, start) {
    let i = start + 1; // Skip #
    let value = '#';

    while (i < code.length && /[a-fA-F0-9]/.test(code[i])) {
        value += code[i++];
    }

    const hashValue = value.slice(1);
    const isColor = /^([a-fA-F0-9]{3}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$/.test(hashValue);
    const type = isColor ? 'color' : 'hash';

    return { token: { type, value }, newIndex: i };
}

function tokenizeIdentifier(code, start) {
    let i = start;
    let value = '';

    while (i < code.length && /[a-zA-Z0-9_-]/.test(code[i])) {
        value += code[i++];
    }

    // Check for function
    if (i < code.length && code[i] === '(') {
        const type = functions.has(value) ? 'function' : 'unknown';
        return { token: { type, value }, newIndex: i };
    }

    // Determine type
    let type = 'identifier';
    if (properties.has(value)) type = 'property';
    else if (value === 'important') type = 'important';

    return { token: { type, value }, newIndex: i };
}

function tokenizeVariable(code, start) {
    let i = start + 2; // Skip --
    let value = '--';

    while (i < code.length && /[a-zA-Z0-9_-]/.test(code[i])) {
        value += code[i++];
    }

    return { token: { type: 'variable', value }, newIndex: i };
}

function tokenizePseudo(code, start) {
    let i = start + 1; // Skip first :
    let value = ':';

    // Check for double colon (pseudo-element)
    if (i < code.length && code[i] === ':') {
        value += code[i++];
    }

    while (i < code.length && /[a-zA-Z-]/.test(code[i])) {
        value += code[i++];
    }

    const pseudoName = value.replace(/^::?/, '');
    const isDoubleColon = value.startsWith('::');

    let type = 'pseudo-class';
    if (isDoubleColon && pseudoElements.has(pseudoName)) {
        type = 'pseudo-element';
    } else if (!isDoubleColon && pseudoClasses.has(pseudoName)) {
        type = 'pseudo-class';
    } else {
        type = isDoubleColon ? 'unknown' : 'unknown';
    }

    return { token: { type, value }, newIndex: i };
}

function tokenizeImportant(code, start) {
    let i = start + 1; // Skip !

    // Skip whitespace
    while (i < code.length && /\s/.test(code[i])) i++;

    if (code.slice(i, i + 9) === 'important') {
        return {
            token: { type: 'important', value: code.slice(start, i + 9) },
            newIndex: i + 9
        };
    }

    return null;
}

