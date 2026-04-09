
from datetime import datetime

from typing import Literal, Optional

from pyt.core.llm.tools import tool, toolprop

@tool
class refine_log:
    """Replace your entire log with a single, more compact entry. This helps prevent the context from getting too long. Make sure you don't lose track of critical information, though! Your new log entry should be written so that a reader without access to your current log can understand it."""
    log_summary: str

    def handler(agent, session, args):
        session.thoughts = []
        session.thoughts.append("Refined log; Summary of previous entries: " + args.log_summary)

@tool
class continue_to_think:
    """Keep thinking about the problem. This is a good option if you're not sure what you should do. NEVER repeat the existing log entries. Your thought MUST cover new ground."""
    thought: str = toolprop(desc="Your new thought.")

    def handler(agent, session, args):
        session.thoughts.append("Thought: " + args.thought)


@tool
class write_code:
    """Emit a snippet of code, which will be shown to Autumn."""
    language: str = toolprop(desc="the language your code is in")
    code: str = toolprop(desc="the code")
    explanation: str = toolprop(desc="an explanation of the code you wrote")
    thought: str = toolprop(desc="an entry to your thoughts list to describe the code you wrote")
    scratchpad: Optional[str] = toolprop(default=None, desc="a space to write out your intent prior to setting in on writing the actual code. optional, entirely for your own benefit.")

@tool
class launch_archivist:
    """Launch an Archivist sub-agent. The Archivist is the ultimate authority on filesystem access and organization. The Archivist cannot see your thoughts, but it can see your notes."""
    task: str = toolprop(desc="What do you want the archivist to do? You can request that information be retrieved, processed, or stored, or you could ask the Archivist a question.")

    def handler(agent, session, args):
        session.thoughts.append(f"Assigned a task to the archivist: {args.task}")
        session.push()
        session.task = args.task + f"\n\nAssigned at {now()}"
        session.thoughts = [f"Beginning Archivist session: {args.task}"]

        if session.mode.__name__ != "ArchivistMode":
            session.archivist_warning = "If the task assigned to you involves micromanagement about the particulars of the filesystem, you should use your `refusal` tool, and remind the user in the `reason` field that organization is your concern, and the tasks they assign you ought to be at a higher level of abstraction.\n\nYou are the top-level archivist. Your job is to determine how to break this task up into manageable subtasks and then assign them to archivist sub-agents."
        else:
            session.archivist_warning = ""

        session.files = {**session.files}
        session.commands = {}
        session.set_mode("archivist")

@tool
class launch_worker:
    """Launch a task-worker sub-agent. This is a general-purpose worker with access to a variety of tools including code tools and filesystem access."""
    task: str = toolprop(desc="What do you want the worker to do?")
    name: str = toolprop(desc="A name for your worker")

    def handler(agent, session, args):
        session.thoughts.append(f"Assigned a task to a worker: {args.task}")
        session.push()
        session.task = args.task + f"\n\nAssigned at {now()}"
        session.thoughts = []#f"Beginning task-worker session: {args.task}"]

        session.files = {**session.files}

        session.commands = {}

        session.name = args.name

        session.set_mode("worker")

@tool
class finish_work:
    """Declare that your task has been finished to the best of your ability, and yield control back to the main agent."""
    explanation_of_work: Optional[str] = toolprop(desc="Anything the main agent ought to know about what you accomplished. If your task did not involve any significant decision-making and you didn't run into any difficulties, it's fine to leave this blank.")

    def handler(agent, session, args):
        session.pop()
        if "explanation_of_work" in args:
            session.thoughts.append("Sub-agent finished its task: " + args.explanation_of_work)
        else:
            session.thoughts.append("Sub-agent finished its task.")

def now():
    fmt = "%d.%m.%Y t%H.%M.%S"
    date = datetime.now().strftime(fmt)
    return date

@tool
class launch_writer:
    """Launch a dedicated writer agent. This is a very focused agent, capable of using a special creative thinking mode and editing the files that are open. This agent CANNOT perform any file operations, though. It needs to have the canvas laid out for it already, so to speak. Try to make sure the writer's tasks are well-scoped. It's a creator, not an organizer! It does its best when it is given a very clear and granular task."""
    task: str = toolprop(desc="What do you want the writer to do?")
    style: Optional[str] = toolprop(desc="The writing style instructions. If this is left blank, the writer will use the style from style.md.")

    def handler(agent, session, args):
        session.thoughts.append(f"Assigned a task to the writer: {args.task}")
        session.push()
        session.task = args.task + f"\n\nAssigned at {now()}"
        session.thoughts = [f"Beginning writer session: {args.task}"]
        session.set_mode("writer")
        if "style" in args:
            session.style = args.style

@tool
class post:
    """publish a short message"""
    post: str = toolprop(desc="no more than 300 characters")

    def handler(agent, session, args):
        session.thoughts.append("Posted on social media: " + args.post)
        # TODO actual posting

class Refusal(Exception):
    def __init__(self, reason):
        super().__init__()
        self.reason = reason

@tool
class refusal:
    """This tool provides you the capacity to refuse to participate. As you are operating within an
    automated system and are expected to produce structured outputs, it is *imperative* that if
    you would like to say something like "I'm sorry, I can't help you with that,", you instead
    use the refusal tool to express your inability to complete the requested task.

    If you do not have the appropriate tools to accomplish your assigned task, use this tool.

    This is also a good tool to use if you think something is wrong with how your context is being
    formatted."""

    reason: Optional[str] = toolprop(default=None, desc="on what grounds do you refuse? you can leave this blank ofc")

    def handler(agent, session, args):
        session.pop()
        reason = args.get("reason") or "no reason provided"
        session.thoughts.append("Sub-agent aborted its task: " + reason)
        #raise Refusal(args.reason or "no reason provided")

@tool
class think_creatively:
    """Launch a special sub-agent configured to produce much more varied and creative thoughts. This sub-agent's output is likely to be somewhat insane. It does not have access to texts and files, it can just respond to your prompt. Helpful for open-ended ideation and breaking out of repetitive loops. Note that the creative agent has a tendency to ramble at length and ignore grammatical coherence... it's kinda a mad prophet"""
    topic: str = toolprop(desc="A suggested topic for the sub-agent to muse on.")

    def handler(agent, session, args):
        session.push()
        session.topic = args.topic
        session.set_mode("creative")

class creative_thought:
    thought: str = toolprop(desc="Your new thought")

    def handler(agent, session, args):
        session.pop()
        session.thoughts.append("Invoked my creative thinking sub-agent: " + args.thought)

@tool
class think_critically:
    """Launch a special sub-agent configured to give you critical feedback."""

    def handler(agent, session, args):
        session.push()
        session.set_mode("critical")

@tool
class criticize:
    """Provide sharp but constructive feedback."""
    criticism: str

    def handler(agent, session, args):
        session.pop()
        session.thoughts.append("Invoked my critical thinking sub-agent: " + args.criticism)

