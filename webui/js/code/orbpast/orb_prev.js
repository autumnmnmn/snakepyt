
export async function main(target) {

    const response = await fetch("test.orb");
    if (!response.ok) {
        throw new Error(`Failed to load test.orb`);
    }
    const orbSource = await response.text();

    console.log(orbSource);

    console.log(dumpNodes(parseOrb(orbSource), orbSource));

}

function parseOrb(input, startIndex = 0, endIndex = input.length) {
    const nodes = [];
    let scanPosition = startIndex;
    let escapeNext = false;

    while (scanPosition < endIndex) {
       let current_node = {
           tag: 'NONE',
           scan_index: scanPosition,
           content_start: scanPosition,
           content_end: scanPosition,
            last_nonws_start: -1,
            last_nonws_end: -1
       };

       while (scanPosition < endIndex) {
           const char = input[scanPosition];

           if (escapeNext) {
               current_node.content_end = scanPosition + 1;
               escapeNext = false;
               scanPosition++;
               continue;
           }

           if (char === '\\') {
               escapeNext = true;
               current_node.content_end = scanPosition + 1;
               scanPosition++;
               continue;
           }

           if (char === '{') {
               scanPosition++; // don't collect the {

               // extract tag
               if (current_node.last_nonws_start !== -1) {
                   const tag = input.substring(current_node.last_nonws_start, current_node.last_nonws_end);
                   current_node.tag = tag;
                   // exclude tag
                   current_node.content_end = current_node.last_nonws_start;
               }

               // finish off the NONE node
               if (current_node.content_end > current_node.content_start) {
                   nodes.push(current_node);
               }

               if (!shouldParseContent(current_node.tag)) {
                   const closing_pos = findClosingBracket(input, scanPosition);
                   const raw_content = input.substring(scanPosition, closing_pos);
                   nodes.push({
                       tag: current_node.tag,
                       raw_content: raw_content,
                       content_start: scanPosition,
                       content_end: closing_pos
                   });
                   scanPosition = closing_pos + 1; // skip }
               } else {
                   const closing_pos = findClosingBracket(input, scanPosition);
                   const nested_content = parseOrb(input, scanPosition, closing_pos);
                   nodes.push({
                       tag: current_node.tag,
                       content: nested_content,
                       content_start: scanPosition,
                       content_end: closing_pos
                   });
                   scanPosition = closing_pos + 1; // skip }
               }
               break;
           }

           if (char === '}') break;

           // Update content endIndex and track non-whitespace
           current_node.content_end = scanPosition + 1;

           if (!/\s/.test(char)) {
               if (current_node.last_nonws_start === -1) {
                   current_node.last_nonws_start = scanPosition;
               }
               current_node.last_nonws_end = scanPosition + 1;
           } else if (current_node.last_nonws_start !== -1) {
               // Hit whitespace after non-whitespace - complete the run
               // (last_nonws_end is already set correctly)
           }

           scanPosition++;
       }

   // finish node
   if (current_node.content_end > current_node.content_start) {
       nodes.push(current_node);
   }

   // if we hit endIndex of input or closing bracket, we're done
   if (scanPosition >= endIndex || input[scanPosition] === '}') {
       break;
   }
}

return nodes;
}

function findClosingBracket(input, startIndex) {
let scanPosition = startIndex;
let depth = 1;
let escapeNext = false;

while (scanPosition < input.length && depth > 0) {
   const char = input[scanPosition];

   if (escapeNext) {
       escapeNext = false;
   } else if (char === '\\') {
       escapeNext = true;
   } else if (char === '{') {
       depth++;
   } else if (char === '}') {
       depth--;
   }

   scanPosition++;
}

return scanPosition - 1;
}

function shouldParseContent(tag) {
return tag !== "fractal";
}

function dumpNodes(nodes, input) {
if (!Array.isArray(nodes)) {
    throw new Error('nodes must be an array');
}
if (typeof input !== 'string') {
    throw new Error('input must be a string');
}

for (const node of nodes) {
    let content;

    if (node.raw_content !== undefined) {
        content = node.raw_content;
    } else if (node.content !== undefined) {
        dumpNodes(node.content, input);
        content = `[${node.content.length} nested nodes]`;
    } else {
        content = input.substring(node.content_start, node.content_end);
    }

    console.log(`TAG{${node.tag}} | CONTENT{${content}}`);
}
}

