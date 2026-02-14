
"use strict";

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
    const module = await import(`/code/${moduleName}.js`);
    if ("main" in module) {
        return await module.main(targetElement, ...args);
    }
    return null;
};

window.$prepMod = async function(moduleName, args = []) {
    const module = await import(`/code/${moduleName}.js`);
    if ("main" in module) {
        const initializer = async targetElement => await module.main(targetElement, ...args);
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
                    return {
                        configurable: true,
                        enumerable: true,
                        value: el.getAttribute(prop.toString())
                    };
                }
                return undefined;
            }
        });
    },
    enumerable: false
});

window.$element = (name) => document.createElement(name);
window.$div = function (className = "") {
    const div = $element("div");
    div.className = className;
    return div;
}

window.$svgElement = (name) =>
    document.createElementNS("http://www.w3.org/2000/svg", name);
window.$mathElement = (name) =>
    document.createElementNS("http://www.w3.org/1998/Math/MathML", name);

window.$actualize = (maybeFunction) => {
    if (typeof maybeFunction === "function") return maybeFunction();
    return maybeFunction;
};

import('/code/control/menu.js');

$mod("theme", document.body);

document.body.$contextMenu = {
    items: Object.entries({
        "toggle theme": async () => $mod("theme", document.body, ["toggle"]),
    })
};

