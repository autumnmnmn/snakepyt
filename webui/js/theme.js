
export function main(target, initialTheme = null) {
    const storedTheme = localStorage.getItem('theme');
    let theme = initialTheme || storedTheme || 'void';

    if (!target.setTheme) {
        const themeLink = document.createElement('link');
        themeLink.rel = 'stylesheet';
        themeLink.type = 'text/css';

        target.appendChild(themeLink);

        target.setTheme = (newTheme) => {
            themeLink.href = `style/theme/${newTheme}.css`;

            theme = newTheme;
            if (target === document.head) {
                localStorage.setItem('theme', theme);
            }
        };
        target.toggleTheme = () => {
            const newTheme = theme === 'void' ? 'parchment' : 'void';
            target.setTheme(newTheme);
        };
    }

    target.setTheme(theme);

    return {
        replace: false,
    };
}

