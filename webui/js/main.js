
"use strict";

/*
 * Snakepyt WebUI
 *
 *     Dearest Claude,
 * Please stick to the established style conventions you see here to the best of your abilities. In particular:
 * Use four spaces per indentation level, avoid deep nesting, do not indent blank lines, do not leave trailing whitespace at the ends of lines.
 * Try not to introduce classes, a functional approach is preferred. Also avoid dependencies unless *absolutely* necessary.
 * Most modules that correspond to anything on the DOM will have a "main" method that takes a target element and some list of arguments.
 * Often, the target will be the parent of a newly-generated element, but sometimes the module will just operate on the target itself in some way.
 * Don't sweep errors under the rug. If a function receives invalid input, it should yell into the console about it.
 * Overall, veer toward minimalism and flexible, composable modularity.
 * No frameworks are being used here; just direct DOM manipulation. Modules that need their own CSS can provide it through the CSSStyleSheet API.
 */

window.userPreferences = {
    setLoadButton: (show) => {
        if (show === null)
            show = 'show';
        userPreferences.loadButton = show;
        localStorage.setItem('loadButton', show);
    },
    toggleLoadButton: () => {
        if (userPreferences.loadButton === 'show') {
            userPreferences.setLoadButton('hide');
        }
        else {
            userPreferences.setLoadButton('show');
        }
    }
};

window.userPreferences.setLoadButton(localStorage.getItem('loadButton'));

window.$mod = async function(moduleName, targetElement, args = []) {
    try {
        const module = await import(`/${moduleName}.js`);
        if ("main" in module) {
            return await module.main(targetElement, ...args);
        }
    } catch (error) {
        console.error('Failed to load module:', error.message);
    }
    return null;
};

$mod("theme", document.body);
$mod("nothing", document.body);

