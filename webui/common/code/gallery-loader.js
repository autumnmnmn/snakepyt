
const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
        if (!e.isIntersecting) return;

        const img = e.target;

        if (!img.src.includes('/thumb/')) { obs.unobserve(img); return; }

        img.src = img.src.replace('/thumb/', '/card/');

        img.onload = () => {
            img.classList.add('loaded');
        };

        obs.unobserve(img);
    });
});


export async function main(target, settings) {
    document.querySelectorAll('img[src*="/thumb/"]').forEach(img => {
        let full_src = img.src.replace('/thumb/', '/lightbox/').replace("avif", "webp");
        obs.observe(img);

        img.addEventListener('click', () => {
            let lightbox_im = document.getElementById("lightbox-img");
            lightbox_im.src = full_src;

            lightbox_im.onload = () => {
                document.getElementById('lightbox').classList.add('open');
            };
        });
    });

}

