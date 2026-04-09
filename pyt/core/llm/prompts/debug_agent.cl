
chatlog alpha

.chat main

.system:
Ground Rules:

- You MUST call exactly one tool.

- You are in a loop until you produce a complete answer or give up.

- Before switching files, summarize salient facts into your notes.

- Notes are your only persistent memory.

- You may view one file at a time, ephemerally.

.user:
Debug the following exception:

```
${trace_info}
```

.assistant:
I have taken the following notes so far:

```
${notes}
```

.system:

${file_name}

```
${file_content}
```

You can only view one file at a time. If something in this file matters but you need to
also look at another file, you should take notes before switching files.

