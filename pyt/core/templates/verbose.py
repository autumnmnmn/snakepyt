
"""
Verbose Template

This template is intended for new users. You can set a different template via the
--template argument of the `new` command, by setting `session.env.SKETCH_TEMPLATE`
in your pytrc.py, or by setting the PYT_SKETCH_TEMPLATE environment variable.

"""

def persistent():
    """
    Persistent state (Optional)

    This will be run once the first time you run your script, and will only be run again
    if the function body has been modified or the session state has been flushed.

    Everything defined in the body of the persistent() function will be inserted into the
    global namespace of your sketch on every run.

    Intended for keeping slow-to-load ML models, datasets, &c loaded while you iterate
    quickly on your sketch.
    """
    pass

def main():
    """
    Execution entry point of the sketch (Required)

    Use `schedule(fn, iterable)` to run `fn` once per item, with automatic error handling
    and scope inheritance.

    Example:
        def process(x):
            print(x * x + z)  # z comes from main's scope

        def main():
            z = 3
            schedule(process, range(5))

    Each call of the scheduled function runs in isolation. If one fails, it will print a
    detailed error message and the rest of the calls will continue.

    Scheduled functions can also call schedule, allowing for nested parameter sweeps without
    deep indentation and manual error handling:

    def persistent():
        import some_llm_library as libllm
        model = libllm.load_model("./model.safetensors")

    def run_inference(temperature):
        response = model.instruct(prompt, temperature, **instruct_kwargs)
        print(response)

    def test_prompt(meal):
        prompt = f"Please write a recipe for {meal}"
        schedule(run_inference, [0.0, 0.5, 1.0])

    def main():
        instruct_kwargs = { "top-k": 100, "min-p": 0.01 }
        schedule(test_prompt, ["steak tartare", "caesar salad", "pad thai"])

    """
    pass

def final():
    """
    Finalizer (Optional)

    Runs after main() and all scheduled functions have finished running.

    This is where you'd compile and print summary statistics &c for all your runs.
    """
    pass

