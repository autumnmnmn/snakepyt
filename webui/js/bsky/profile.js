
$css(`
    .bsky {
        line-height: 1.5em;
    }

    .bsky .profile .title {
        line-height: 1.25em;
        text-align: center;
        margin: auto;
        width: fit-content;
        border-bottom: 3px double var(--main-faded);
        padding-left: 0.75em;
        padding-right: 0.75em;
        margin-top: 0.3em;
    }

    .bsky .profile .handle {
        font-size: 0.8em;
        text-align: center;
        color: var(--main-faded);
    }

    .bsky .profile .avatar {
        height: 6em;
        border-radius: 3px;
        flex-shrink: 0;
        border: 1px solid var(--main-solid);
    }

    .bsky .profile .id-header {
        display: flex;
        padding-bottom: 1em;
    }

    .bsky .profile .names {
        padding-top: 0em;
        width: 100%;
    }

    .bsky .quoted {
        position: relative;
        overflow: visible;
        margin-bottom: 1em;
        max-width: calc(100% - 2em);
    }

    .bsky .quoted::before {
        content: '“';
        padding-right: 0.5em;
        font-size: 2em;
        font-family: "Garamond", "Times New Roman", "Georgia", serif;
    }

    .bsky .quoted::after {
        content: '”';
        padding-left: 0.5em;
        font-size: 2em;
        position: absolute;
        bottom: 0px;
        font-family: "Garamond", "Times New Roman", "Georgia", serif;
    }

    .bsky .publications .banner {
        max-height: 15em;
        border-radius: 3px;
        width: 100%;
    }

    .bsky .publications .thumbnail {
        border-radius: 3px;
        max-width: 80%;
        margin: auto;
    }

    .bsky a.external {
        color: var(--main-solid);
    }

    .bsky .pin-container {
        display: inline-flex;
        flex-direction: column;
        max-width: calc(100% - 2em);
    }
    .
`);

async function getPublicData(endpoint, params = {}) {
    if (!endpoint) throw new Error("endpoint required");

    const url = new URL(`https://public.api.bsky.app/xrpc/${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) url.searchParams.set(key, value);
    });

    const response = await fetch(url);
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Request failed: ${error.message || response.statusText}`);
    }

    return response.json();
}

const profile = await getPublicData("app.bsky.actor.getProfile", {
    actor: "ponder.ooo"
});

const pinned = (await getPublicData("app.bsky.feed.getPosts", {
    uris: [profile.pinnedPost.uri]
})).posts[0];

console.log(pinned);

export async function main(target) {
    const container = $div("full bsky");

    const profileContainer = $div("full profile");

    const publications = $div("full publications");

    await $mod("layout/split", container, [{ content: [profileContainer, publications], percents: [40, 60]}]);

    const idHeader = $div("id-header");

    const names = $div("names");

    const handle = $div("handle");
    handle.innerText = `@${profile.handle}`;

    const title = $element("h1");
    title.innerText = profile.displayName;
    title.classList = "title";

    const description = $element("p");
    description.innerText = profile.description;
    description.classList = "quoted";

    const avatar = $element("img");
    avatar.src = profile.avatar;
    avatar.classList = "avatar";

    const readers = $div();
    readers.innerText = `${profile.followersCount} readers`;

    const pubCount = $div();
    pubCount.innerText = `${profile.postsCount} publications`;

    const banner = $element("img");
    banner.src = profile.banner;
    banner.classList = "banner";
    publications.appendChild(banner);

    if (pinned.embed?.$type === "app.bsky.embed.images#view") {
        const pin = $div("quoted");

        const pinContainer = $div("pin-container");

        const pinText = $element("p");
        pinText.innerText = pinned.record.text;
        pinContainer.appendChild(pinText);

        for (const imageData of pinned.embed.images) {
            const image = $element("img");
            image.src = imageData.thumb;
            image.classList = "thumbnail";
            pinContainer.appendChild(image);
        }

        publications.$with(pin.$with(pinContainer));
    }
    else if (pinned.embed?.$type === "app.bsky.embed.external#view") {
        const pin = $div("quoted");

        const pinContainer = $div("pin-container");

        const pinText = $element("p");
        pinText.innerText = pinned.record.text;
        pinContainer.appendChild(pinText);

        const embedTitle = $element("a");
        embedTitle.href = pinned.embed.external.uri;
        embedTitle.innerText = pinned.embed.external.title;
        embedTitle.classList = "external";

        const image = $element("img");
        image.src = pinned.embed.external.thumb;
        image.classList = "thumbnail";

        pinContainer.appendChild(embedTitle);
        pinContainer.appendChild(image);

        pin.appendChild(pinContainer);
        publications.appendChild(pin);

    }
    else {
        const pin = $element("p");
        pin.innerText = pinned.record.text;
        pin.classList = "quoted";
        publications.appendChild(pin);
    }

    profileContainer.$with(
        idHeader.$with(
            avatar,
            names.$with(
                title,
                handle
            )
        ),
        description,
        pubCount,
        readers
    );

    target.$with(container);

    return { replace: true };
}

console.log(profile);

