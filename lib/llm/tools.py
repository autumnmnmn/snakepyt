
import json
import re
import requests

from typing import List, Dict, Any, Optional

from lib.llm.chatlog import AttrDict, chatEntry, load_chatlog


def toolprop_enum(options: List[str], **etc) -> Dict:
    return {**etc, "type": "string", "enum": options}

def toolprop_string(**etc) -> Dict:
    return {**etc, "type": "string"}

def toolprop_number(**etc) -> Dict:
    return {**etc, "type": "number"}

def toolprop_bool(**etc) -> Dict:
    return {**etc, "type": "boolean"}

def toolprop_object(properties: Dict, **etc) -> Dict:
    return {
        **etc,
        "properties": properties,
        "required": list(properties.keys()),
        "type": "object",
        "additionalProperties": False
    }

tp = AttrDict({
    "enum": toolprop_enum,
    "string": toolprop_string,
    "number": toolprop_number,
    "object": toolprop_object,
    "bool": toolprop_bool
})

def tool(name: str, description: str, properties: Dict) -> Dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": toolprop_object(properties)
        }
    }

def tool_call(api, model, messages: List[Dict], tools: List[Dict], **etc) -> Dict:
    try:
        response = requests.post(
            f"{api}/v1/chat/completions",
            headers={"Content-Type": "application/json"},
            json={
                "model": model,
                "messages": messages,
                "tools": tools,
                "chat_template_kwargs": {"enable_thinking": False},
                "tool_choice": "required",
                **etc
            }
        )
        return response.json()
    except:
        return {
            "error": "api call failed",
            "response": response
        }

