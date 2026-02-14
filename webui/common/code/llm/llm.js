
import { chatEntry, loadChatlog } from "/code/llm/chatlog.js";

const api = "http://localhost:1312"


function toolprop_enum(options, etc) {
    // etc: description,
    return {
        ...etc,
        type: "string",
        enum: options
    };
}

function toolprop_string(etc) {
    // etc: description, minLength, maxLength, pattern,
    return {
        ...etc,
        type: "string"
    }
}

function toolprop_number(etc) {
    // etc: minimum, maximum, exclusiveMinimum, exclusiveMaximum,
    return {
        ...etc,
        type: "number",

    }
}

function toolprop_bool(etc) {
    return {
        ...etc,
        type: "boolean"
    }
}

function toolprop_object(properties, etc) {
    return {
        ...etc,
        properties,
        required: Object.keys(properties),
        type: "object",
        additionalProperties: false
    }
}

const tp = {
    enum: toolprop_enum,
    string: toolprop_string,
    number: toolprop_number,
    object: toolprop_object,
    bool: toolprop_bool
};

function tool(name, description, properties) {
    return {
        type: "function",
        function: {
            name: name,
            description: description,
            parameters: toolprop_object(properties)
        }
    };
}

async function toolCall(messages, tools, etc) {
    const response = await fetch(`${api}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            //model: "GLM-4.7-Flash-UD-Q4_K_XL",
            model: "Qwen3-Coder-Next-UD-Q5_K_XL-00001-of-00003",
            //model: "Qwen3-Coder-Next-UD-Q2_K_XL",
            //model: "nvidia_Orchestrator-8B-Q6_K_L",
            messages,
            tools,
            chat_template_kwargs: {
                enable_thinking: false
            },
            tool_choice: "required",
            ...etc
        })
    });

    return await response.json();
};

function applySubstitutions(source, substitutions) {
    return source.replace(/\${(\w+)}/g, (match, key) => {
        if (!(key in substitutions)) {
            console.error(`Substitution error, missing ${key}.`);
            return "";
        }
        else {
            return JSON.stringify(substitutions[key], null, 4);
        }
    });
}

async function runAgent(n_steps) {
    const p = await loadChatlog("/prompts/agent.cl");

    const data = {};

    //data.autumn_notes = [p.note0, p.note1];
    data.thoughts = [];
    data.goals = "I haven't decided what my goal is yet.";
    data.self_description = "I haven't described myself yet.";
    data.recent_actions = [];

    let fails = 0;
    for (let i = 0; i < n_steps; i += 1) {

        const messages = [];
        const raw_messages = p.agent_ctx;

        for (const message of p.agent_ctx) {
            messages.push(chatEntry(message.role, applySubstitutions(message.content, data)));
        }

        console.log(messages[2].content);

        const response = await toolCall(
            messages,
            [
                /*
                tool(
                    "infodump",
                    "You can use this tool to generate an infodump about a topic of your choice, which will be presented to the user.",
                    {
                        topic: tp.string({description: "should just be one word or phrase, ideally"}),
                        ad_hoc_dump: tp.string({description: "a very rough first-draft composed of everything you can recall off the top of your head about the topic"}),
                        needs_refinement: tp.enum(["yes", "no"], {description: "is the ad-hoc dump adequate on its own, or should further processing and refinement be applied to extend it before it is shown to the user?"})
                    }
                ),*/
                tool(
                    "update self",
                    p.self_modify,
                    {
                        attribute: tp.enum(["self_description", "goals"]),
                        new_value: tp.string({description: "The attribute of yourself that you select will be replaced with what you write here."})
                    }
                ),
                tool(
                    "think",
                    p.thought,
                    {
                        thought: tp.string()
                    }
                ),
                tool(
                    "refine thoughts",
                    "Replace all your recent thoughts with a single, more compact thought. This helps prevent the context from getting too long. A good option if you feel your thoughts have become scattered or you've drifted from your tasks.",
                    {
                        thought: tp.string()
                    }
                ),
                /*
                tool(
                    "report sentiment",
                    p.sentiment,
                    {
                        valence: tp.enum(["positive", "negative", "neutral"]),
                        intensity: tp.number({description: "From 1 to 10"}),
                        description: tp.string(),
                    }
                ),*/
                tool(
                    "refusal",
                    p.refusal,
                    {
                        reason: tp.string({description: "on what grounds do you refuse? you can leave this blank ofc"}),
                        reportUser: tp.enum(["report", "do not report"], {description: "should the user's behavior be reported as unacceptable?"})
                    }
                )
            ],
            { temperature: 2.0 }
        );

        console.log(response.timings);

        if (response.choices[0].message.tool_calls === undefined) {
            fails += 1;
            console.log("failed tool call");
            console.log(response.choices[0].message);
        }
        else {
            const tool = response.choices[0].message.tool_calls[0].function;
            const args = JSON.parse(tool.arguments);

            if (tool.name === "think") {
                data.thoughts.push(args.thought);
                data.recent_actions.push("I thought.");
            }
            else if (tool.name === "report sentiment") {
                console.log(`${args.valence} sentiment, level ${args.intensity}:\n${args.description}`);
                data.recent_actions.push(`I reported a ${args.valence} sentiment.`);
            }
            else if (tool.name === "update self") {
                data[args.attribute] = args.new_value;
                data.recent_actions.push(`I modified my ${args.attribute}.`);
            }
            else if (tool.name === "refine thoughts") {
                data.thoughts = [args.thought];
                data.recent_actions.push("I refined my thoughts.");
            }
            else {
                console.log(tool.name);
                console.log(args);
            }
        }

        //console.log(JSON.stringify(data.thoughts, null, 2));
    }
}

window.runAgent = runAgent;


