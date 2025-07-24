"use strict";
document.body.addEventListener('keydown', (event) => {
    if (event.key === 'R' && event.ctrlKey) {
        event.preventDefault();
        fetch('/cmd_build', { method: 'GET' })
            .then(response => response.text())
            .then(text => {
            if (text === 'success') {
                setTimeout(() => location.reload(), 500);
                return;
            }
            console.warn('failed build');
        })
            .catch(error => {
            console.error(error);
        });
        return;
    }
    if ((event.key === 'r' && event.ctrlKey) || event.key === 'F5') {
        event.preventDefault();
        return;
    }
    if (event.key === 'l' && event.ctrlKey) {
        event.preventDefault();
        userPreferences.toggleLoadButton();
        return;
    }
});
