"use strict";

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

$mod("theme", document.head);
$mod("nothing", document.body);

