
"use strict";

import '/code/control/menu.js';

import { applyTheme } from '/code/theme.js';

applyTheme(document.body);

document.body.$contextMenu = {
    items: Object.entries({
        "toggle theme": async () => applyTheme(document.body, "toggle"),
    })
};

