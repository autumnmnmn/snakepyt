export function instantiate(target) {
    let button = document.createElement('button');
    button.setAttribute('aria-label', 'toggle theme');
    button.innerText = '';
    button.classList.add('theme-toggle');
    button.addEventListener('click', () => {
        userPreferences.toggleTheme();
    });
    target.appendChild(button);
}
