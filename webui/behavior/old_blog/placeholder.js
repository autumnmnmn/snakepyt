export function instantiate(target) {
    let emptiness = document.createElement('div');
    emptiness.classList.add('nothing');
    emptiness.innerText = 'nothing :)';
    target.appendChild(emptiness);
}
