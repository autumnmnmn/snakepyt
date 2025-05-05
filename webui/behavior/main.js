"use strict";

window.userPreferences = {
    setTheme: (theme) => {
        if (theme === null)
            theme = 'void';
        userPreferences.theme = theme;
        localStorage.setItem('theme', theme);
        const themeLink = document.getElementById('themeLink');
        themeLink.href = `style/theme/${theme}.css`;
    },
    setLoadButton: (show) => {
        if (show === null)
            show = 'show';
        userPreferences.loadButton = show;
        localStorage.setItem('loadButton', show);
    },
    toggleTheme: () => {
        if (userPreferences.theme === 'void') {
            userPreferences.setTheme('parchment');
        }
        else {
            userPreferences.setTheme('void');
        }
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


window.userPreferences.setTheme(localStorage.getItem('theme'));
window.userPreferences.setLoadButton(localStorage.getItem('loadButton'));


