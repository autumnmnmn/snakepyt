
$css(`
    .spinner {
        opacity: 1;
        width: 0px;
        height: 0px;
        position: relative;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: transparent;
        animation: spin 2.7s infinite linear;
        transition: opacity 1.5s ease-in;
        overflow: initial;
    }

    .spinner-button {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 4em;
        height: 4em;
        border-radius: 50%;
        border: none;
        opacity: 0;
        transition: opacity 1s ease;
        background-color: var(--main-solid);
        color: var(--main-solid-content);
        cursor: pointer;
        display: none;
        padding: 0;
    }

    .spinner-button:hover {
        background-color: var(--main-transparent);
    }

    .spinner-orb {
        position: absolute;
        top: 50%;
        left: 50%;
        transform-origin: center;
        transform: translate(-50%, -50%);
        background-color: transparent;
        border: 0.3em solid var(--main-solid);
        border-radius: 50%;
        transition: left 1.3s ease;
        overflow: initial;
    }

    .spinner-orb[class*=" 0"] {
        width: 100px;
        height: 100px;
        left: 0.5em;
        border-width: 0.5em;
        animation: spin 3.3s infinite linear;
    }

    .spinner-orb[class*=" 1"] {
        width: 75px;
        height: 75px;
        left: 175px;
        animation: spin 0.8s reverse infinite linear;
    }

    .spinner-orb[class*=" 2"] {
        width: 55px;
        height: 55px;
        left: -200px;
        border-width: 0.15em;
        transform: translate(-50%, -50%);
    }

    @keyframes spin {
        from {
            transform: translate(-50%, -50%) rotate(0deg);
        }

        to {
            transform: translate(-50%, -50%) rotate(360deg);
        }
    }
`);

export async function main(target, modNext = "nothing") {
    let spinner = document.createElement('div');
    let orb0 = document.createElement('div');
    let orb1 = document.createElement('div');
    let orb2 = document.createElement('div');
    let button = document.createElement('button');

    button.innerText = 'enter';
    button.classList.add('spinner-button');

    spinner.classList.add('spinner');

    orb0.classList.add('spinner-orb');
    orb0.classList.add('0');

    orb1.classList.add('spinner-orb');
    orb1.classList.add('1');

    orb2.classList.add('spinner-orb');
    orb2.classList.add('2');

    target.appendChild(spinner);
    target.appendChild(button);
    spinner.appendChild(orb0);
    orb0.appendChild(orb1);
    orb1.appendChild(orb2);

    let removeLoader = async (e) => {
        spinner.style.opacity = '0';
        button.style.opacity = '0';
        orb0.style.left = '50%';
        orb1.style.left = '50%';
        orb2.style.left = '50%';
        await $mod(modNext, target);
        setTimeout(async () => {
            spinner.remove();
            button.remove();
        }, 1500);
    };

    setTimeout(() => {
        button.style.opacity = 1;
    }, 100);
    button.addEventListener('click', removeLoader);
    button.style.display = 'initial';

    return {
        replace: true
    };
}

