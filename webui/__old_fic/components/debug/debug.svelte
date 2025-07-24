<script lang="ts">
    async function files() {
        try {
            const directoryHandle = await window.showDirectoryPicker();
            const entries = []
            for await (const entry of directoryHandle.values()) {
                entries.push(entry);
            }
            console.log(entries);
        } catch (error) {
            console.error('Unable to open directory:', error);
        }
    }
</script>

<div>
    <button on:mousedown={files}>Files</button>
</div>

<style>
    div {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    }

    button {
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    }
</style>