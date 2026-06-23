"use strict";

$css(`
    .file-combiner {
        display: flex;
        height: 100%;
        width: 100%;
        box-sizing: border-box;
        overflow: hidden;
        background-color: var(--main-background);
        color: var(--main-solid);
        font-family: var(--main-font, monospace);
    }

    .file-combiner .left-pane {
        flex: 1;
        overflow-y: auto;
        padding: 24px;
        display: flex;
        flex-wrap: wrap;
        align-content: flex-start;
        gap: 24px;
        position: relative;
    }

    .file-combiner .right-pane {
        flex: 0 0 40%;
        max-width: 800px;
        background-color: var(--main-background);
        border-left: 2px solid var(--main-faded);
        display: flex;
        flex-direction: column;
    }

    /* Group Card */
    .file-combiner .file-group {
        border: 2px dashed var(--main-faded);
        border-radius: 12px;
        padding: 20px;
        width: 350px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        transition: border-color 0.2s, background-color 0.2s;
        background-color: var(--main-background);
    }
    
    .file-combiner .file-group.drag-over {
        border-color: var(--main-solid);
        background-color: var(--main-faded);
    }

    /* Header & Inputs */
    .file-combiner .group-header-container {
        display: flex;
        gap: 8px;
        align-items: center;
    }
    
    .file-combiner .group-title-input {
        flex: 1;
        background: transparent;
        border: 1px dashed transparent;
        color: var(--main-solid);
        font-size: 1.2em;
        font-weight: bold;
        font-family: inherit;
        text-align: center;
        border-radius: 6px;
        padding: 4px;
        width: 100%;
        transition: background 0.2s, border-color 0.2s;
    }
    
    .file-combiner .group-title-input:hover, 
    .file-combiner .group-title-input:focus {
        border-color: var(--main-faded);
        outline: none;
        background: var(--main-faded);
    }
    
    .file-combiner .delete-group-btn {
        background: transparent;
        border: none;
        color: var(--main-solid);
        cursor: pointer;
        font-size: 1.2em;
        padding: 4px;
        border-radius: 4px;
    }
    
    .file-combiner .delete-group-btn:hover {
        background-color: var(--main-faded);
    }

    /* File List */
    .file-combiner .file-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex-grow: 1;
        min-height: 100px;
    }
    
    .file-combiner .file-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background-color: var(--main-faded);
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 0.9em;
    }
    
    .file-combiner .file-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* Buttons */
    .file-combiner button {
        background-color: var(--main-background);
        color: var(--main-solid);
        border: 1px solid var(--main-faded);
        border-radius: 6px;
        padding: 6px 12px;
        cursor: pointer;
        font-family: inherit;
        transition: background-color 0.2s;
    }
    
    .file-combiner button:hover { 
        background-color: var(--main-faded); 
    }

    .file-combiner .actions {
        display: flex;
        gap: 12px;
    }
    
    .file-combiner .actions button { 
        flex: 1; 
    }

    .file-combiner .remove-btn { 
        padding: 4px 8px; 
        font-size: 0.8em; 
    }

    .file-combiner .add-group-btn {
        border: 2px dashed var(--main-faded);
        background-color: transparent;
        color: var(--main-solid);
        font-size: 1.2em;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 150px;
        width: 350px;
        height: fit-content;
    }
    
    .file-combiner .add-group-btn:hover {
        border-color: var(--main-solid);
        background-color: var(--main-faded);
    }

    /* Preview Panel */
    .file-combiner .preview-header {
        padding: 16px;
        background-color: var(--main-faded);
        border-bottom: 2px solid var(--main-faded);
        font-weight: bold;
        color: var(--main-solid);
    }
    
    .file-combiner .preview-content {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        margin: 0;
        color: var(--main-solid);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        font-size: 0.9em;
    }

    /* Toast */
    .file-combiner .toast {
        position: fixed;
        bottom: 24px;
        left: 24px;
        background: var(--main-solid);
        color: var(--main-background);
        padding: 12px 20px;
        border-radius: 8px;
        font-weight: bold;
        display: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        z-index: 100;
    }
`);

export async function main() {
    const container = $div("file-combiner");
    const leftPane = $div("left-pane");
    const rightPane = $div("right-pane");

    const addGroupBtn = $element("button");
    addGroupBtn.className = "add-group-btn";
    addGroupBtn.innerText = "+ Add Group";

    const previewHeader = $div("preview-header");
    previewHeader.innerText = "Preview";
    const previewContent = $element("pre");
    previewContent.className = "preview-content";
    previewContent.innerText = "// select a group to preview";

    rightPane.$with(previewHeader, previewContent);

    const toast = $div("toast");

    container.$with(leftPane, rightPane, toast);
    leftPane.$with(addGroupBtn);

    let groupInstances = [];
    let currentPreviewId = null;
    let toastTimeout;

    // -- Global State Management --

    function showToast(msg) {
        toast.textContent = msg;
        toast.style.display = "block";
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => { toast.style.display = "none"; }, 4000);
    }

    function showPreview(title, markdown) {
        previewHeader.textContent = title ? `Preview: ${title}` : "Preview";
        previewContent.textContent = markdown || (title ? "// group is empty" : "// select a group to preview");
    }

    function saveAll() {
        const state = groupInstances.map(g => g.getState());
        try {
            localStorage.setItem('fileCombinerState', JSON.stringify(state));
        } catch (e) {
            console.warn("Storage quota exceeded!", e);
            showToast("Storage quota exceeded! Changes won't persist on reload.");
        }
    }

    function addGroup(initialData, skipSave = false) {
        const group = createFileGroup(initialData);
        groupInstances.push(group);
        leftPane.insertBefore(group.element, addGroupBtn);
        if (!skipSave) saveAll();
    }

    // -- Factory Component --

    function createFileGroup(initialData) {
        const id = initialData.id || Math.random().toString(36).substring(2);
        let title = initialData.title || "New Group";
        let files = initialData.files || [];

        const groupContainer = $div("file-group");

        const headerContainer = $div("group-header-container");
        const titleInput = $element("input");
        titleInput.className = "group-title-input";
        titleInput.value = title;
        titleInput.oninput = (e) => {
            title = e.target.value;
            triggerUpdate();
        };

        const deleteGroupBtn = $element("button");
        deleteGroupBtn.className = "delete-group-btn";
        deleteGroupBtn.innerHTML = "🗑️";
        deleteGroupBtn.title = "Delete Group";
        deleteGroupBtn.onclick = () => {
            groupContainer.remove();
            groupInstances = groupInstances.filter(g => g.id !== id);
            if (currentPreviewId === id) {
                showPreview("", "");
                currentPreviewId = null;
            }
            saveAll();
        };

        headerContainer.$with(titleInput, deleteGroupBtn);

        const fileList = $element("ul");
        fileList.className = "file-list";

        const topActions = $div("actions");
        const previewBtn = $element("button");
        previewBtn.textContent = "Preview";
        previewBtn.onclick = () => {
            currentPreviewId = id;
            showPreview(title, generateMarkdown());
        };

        const copyBtn = $element("button");
        copyBtn.textContent = "Copy MD";

        topActions.$with(previewBtn, copyBtn);

        const bottomActions = $div("actions");
        const clearBtn = $element("button");
        clearBtn.textContent = "Clear Files";
        clearBtn.onclick = () => {
            files = [];
            renderFiles();
            triggerUpdate();
        };

        bottomActions.$with(clearBtn);

        groupContainer.$with(headerContainer, fileList, topActions, bottomActions);

        // D&D Logic
        groupContainer.addEventListener("dragover", (e) => {
            e.preventDefault();
            groupContainer.classList.add("drag-over");
        });

        groupContainer.addEventListener("dragleave", (e) => {
            e.preventDefault();
            groupContainer.classList.remove("drag-over");
        });

        groupContainer.addEventListener("drop", async (e) => {
            e.preventDefault();
            groupContainer.classList.remove("drag-over");
            if (!e.dataTransfer || !e.dataTransfer.files) return;

            const droppedFiles = Array.from(e.dataTransfer.files);
            for (const file of droppedFiles) {
                const buffer = await file.arrayBuffer();
                try {
                    const decoder = new TextDecoder("utf-8", { fatal: true });
                    files.push({
                        id: Math.random().toString(36).substring(2),
                        name: file.name,
                        content: decoder.decode(buffer)
                    });
                } catch (err) {
                    console.warn(`Skipping: ${file.name} - invalid UTF-8`);
                }
            }
            
            renderFiles();
            triggerUpdate();
        });

        // Reactivity
        function renderFiles() {
            fileList.innerHTML = "";
            if (files.length === 0) {
                const emptyMsg = $div();
                emptyMsg.style.opacity = "0.5";
                emptyMsg.style.textAlign = "center";
                emptyMsg.style.marginTop = "20px";
                emptyMsg.textContent = "drag files here...";
                fileList.appendChild(emptyMsg);
                return;
            }

            files.forEach((f) => {
                const li = $element("li");
                li.className = "file-item";

                const nameSpan = $element("span");
                nameSpan.className = "file-name";
                nameSpan.textContent = f.name;
                nameSpan.title = f.name;

                const removeBtn = $element("button");
                removeBtn.className = "remove-btn";
                removeBtn.textContent = "✕";
                removeBtn.onclick = () => {
                    files = files.filter((x) => x.id !== f.id);
                    renderFiles();
                    triggerUpdate();
                };

                li.$with(nameSpan, removeBtn);
                fileList.appendChild(li);
            });
        }

        function generateMarkdown() {
            return files.map((f) => {
                const backtickMatches = f.content.match(/`{3,}/g);
                let fenceLength = 3;
                if (backtickMatches) {
                    fenceLength = Math.max(...backtickMatches.map((m) => m.length)) + 1;
                }
                const fence = "`".repeat(fenceLength);
                
                let ext = "";
                const parts = f.name.split(".");
                if (parts.length > 1) {
                    ext = parts.pop();
                }

                return `### \`${f.name}\`\n${fence}${ext}\n${f.content}\n${fence}\n`;
            }).join("\n");
        }

        function triggerUpdate() {
            saveAll();
            // actively hydrate the right-side panel if this is currently being looked at
            if (currentPreviewId === id) {
                showPreview(title, generateMarkdown());
            }
        }

        copyBtn.onclick = async () => {
            if (files.length === 0) return;
            try {
                await navigator.clipboard.writeText(generateMarkdown());
                const originalText = copyBtn.textContent;
                copyBtn.textContent = "Copied! ˶ᵔ ᵕ ᵔ˶";
                setTimeout(() => { copyBtn.textContent = originalText; }, 2000);
            } catch (err) {
                console.error("clipboard write failed :(", err);
                copyBtn.textContent = "Failed :(";
            }
        };

        renderFiles();

        return {
            id,
            element: groupContainer,
            getState: () => ({ id, title, files })
        };
    }

    // -- Initialization --

    addGroupBtn.onclick = () => addGroup({});

    const saved = localStorage.getItem('fileCombinerState');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                parsed.forEach(data => addGroup(data, true));
            } else {
                addGroup({ title: 'Group A' }, true);
            }
        } catch (e) {
            console.warn("corrupted localstorage, dropping state");
            addGroup({ title: 'Group A' }, true);
        }
    } else {
        addGroup({ title: 'Group A' }, true);
    }

    // You can test replacing the default screen from nothing- like menuItems.concat = load("layout/concat")
    return {
        dom: [container],
        replace: true
    };
}