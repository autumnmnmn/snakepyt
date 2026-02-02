
export default {

    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === "/") {
            return env.SITE.fetch(
                new URL(env.WEBUI_MAIN ?? "/markup/main.html", url)
            );
        }

        return env.SITE.fetch(request);
    }

};

