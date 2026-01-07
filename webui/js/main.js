
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
 * Prefer double quotes around string literals, except in the case of single characters. Correct this when you find deviations.
 */

window.userPreferences = {
    setLoadButton: (show) => {
        if (show === null)
            show = "show";
        userPreferences.loadButton = show;
        localStorage.setItem("loadButton", show);
    },
    toggleLoadButton: () => {
        if (userPreferences.loadButton === "show") {
            userPreferences.setLoadButton("hide");
        }
        else {
            userPreferences.setLoadButton("show");
        }
    }
};

window.userPreferences.setLoadButton(localStorage.getItem("loadButton"));

window.$mod = async function(moduleName, targetElement, args = []) {
    const module = await import(`/${moduleName}.js`);
    if ("main" in module) {
        return await module.main(targetElement, ...args);
    }
    return null;
};

window.$prepMod = async function(moduleName, args = []) {
    const module = await import(`/${moduleName}.js`);
    if ("main" in module) {
        const initializer = async (targetElement) => await module.main(targetElement, ...args);
        initializer.$isInitializer = true;
        return initializer;
    }
    return null;
}

window.$css = async function(cssText) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
};

Object.defineProperty(Element.prototype, "$with", {
    value: function(...children) {
        for (const child of children) {
            this.appendChild(child);
        }
        return this;
    },
    enumerable: false
});


Object.defineProperty(Element.prototype, "$attrs", {
    get() {
        if (this.__attrsProxy) return this.__attrsProxy;

        const el = this;
        this.__attrsProxy = new Proxy({}, {
            get(_, prop) {
                return el.getAttribute(prop.toString());
            },
            set(_, prop, val) {
                el.setAttribute(prop.toString(), val);
                return true;
            },
            deleteProperty(_, prop) {
                el.removeAttribute(prop.toString());
                return true;
            },
            has(_, prop) {
                return el.hasAttribute(prop.toString());
            },
            ownKeys() {
                return Array.from(el.attributes).map(a => a.name);
            },
            getOwnPropertyDescriptor(_, prop) {
                if (el.hasAttribute(prop.toString())) {
                    return { configurable: true, enumerable: true, value: el.getAttribute(prop.toString()) };
                }
                return undefined;
            }
        });
    },
    enumerable: false
});

window.$element = (name) => document.createElement(name);
window.$div = function (classList = "") {
    const div = $element("div");
    div.classList = classList;
    return div;
}

window.$svgElement = (name) => document.createElementNS("http://www.w3.org/2000/svg", name);
window.$mathElement = (name) => document.createElementNS("http://www.w3.org/1998/Math/MathML", name);

window.$tau = 6.283185307179586;

window.$actualize = (maybeFunction) => {
    if (typeof maybeFunction === "function") return maybeFunction();
    return maybeFunction;
};

import('/control/menu.js');

$mod("theme", document.body);

