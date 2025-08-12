import math
import gc
import importlib
import torch
import torch.nn as nn
from torch.nn import functional as func
import numpy as np
import transformers
from diffusers import UNet2DConditionModel
from PIL import Image
from matplotlib import pyplot as plt
from IPython.display import display, clear_output

from autumn.notebook import *
from autumn.math import *
from autumn.images import *
from autumn.guidance import *
from autumn.scheduling import *
from autumn.solvers import *
from autumn.py import *

from models.clip import PromptEncoder
from models.sdxl import Decoder

# -- Cell -- #

# settings

base_model = "/run/media/ponder/ssd0/ml_models/ql/hf-diff/stable-diffusion-xl-base-0.9"
noise_predictor_model = base_model
decoder_model = base_model
XL_MODEL = True
vae_scale = 0.13025 # TODO: get this from config

run_ids = range(50)

frac_done = lambda length, index: 1 - (length - index - 1) / (length - 1)

def add_run_context(context):
    context.run_lerp = lambda a, b: lerp(a,b,frac_done(len(run_ids),context.run_id))
    #print(context.run_lerp(1, 1.045))

seed = lambda c: 235468 + c.run_id

width_height = lambda c: (16, 16)

steps = lambda c: 40

def modify_initial_latents(context, latents):
    b,c,h,w = latents.shape
    #latents *= 0
    pass

timestep_power = lambda c: 1
timestep_max = lambda c: 999
timestep_min = lambda c: 0

p2 = "monumental fountain shaped like an extremely powerful guitar. gigantic gargantuan tangled L-system of cables made of steel and dark black wet oil"

p3 = "magnificent statue made of full bleed meaning, lightning-ripple ridges of watercolor congealed blood on paper, textual maximalism, james webb space telescope, flowing drip reverse injection needle point electric flow, bleeding from the translucent membrane, empty nebula revealing stars"

p4 = "award-winning hd lithograph of beautiful reflections of autumn leaves in a koi pond"

p1 = "beautiful daguerreotype photograph of the crucifixion of Spongebob Squarepants"

p = "ancient relief of a tarantula carved into the bare blood-red and white marble cliff. bright gold venom streaks through cracks in the marble, transcendental cubist painting"

p_mir = "A football game on TV reflects in a bathroom mirror. Nearby, a magnificent statue made of full bleed meaning lightning-ripple ridges of watercolor congealed blood on paper james webb space telescope flowing drip reverse injection flow translucent membrane empty nebula."

n_p = "boring, ugly, blurry, jpeg artefacts"

def add_step_context(c):
    c.step_frac = frac_done(c.steps, c.step_index)
    c.lerp = lambda a, b: lerp(a,b,c.step_frac)
    #c.foo = c.run_lerp(0, 0.5)

prompts = lambda c: {
    "encoder_1": [n_p, p1],
    "encoder_2": None,
    "encoder_2_pooled": None
}

sig = lambda a, b: scale_f(sigmoid(a, b), vae_scale, vae_scale)

cfg_combiner = lambda c: scaled_CFG(
    difference_scales = [
        (1, 0, id_)
        #(0, -1, id_)
    ],
    steering_scale = lambda x: 1.5 * 1.015 * x,#c.lerp(1.015 + c.foo, 0.9),#c.run_lerp(1.01, 1.04), #* (2 - c.sqrt_signal),
    base_term = lambda predictions, true_noise: predictions[0],#lerp(true_noise, predictions[0], 0),
    total_scale = lambda predictions, cfg_result: cfg_result
)


old_combiner = lambda c: lambda p, n: n + (p[0] - n) * 1.015

tnr_combiner = lambda c: lambda l, p, n: n - 2 * c.lerp(0.1 * 30 / c.steps, 0.01 * 30 / c.steps) * (n - p[0])
simple = lambda c: lambda p, n: p[0]
#cons_combiner = lambda c: lambda l, p, n: 2 * (2 * p[1] - n - 1 * p[0]) * (c.forward_noise_total[c.end] - c.forward_noise_total[c.start])
cons_combiner = lambda c: lambda l, p, n: 1.8 * (p[0] - n) * (c.forward_noise_total[c.end] - c.forward_noise_total[c.start])

# (c.end_noise - c.start_noise / c.signal_ratio) => pure gray latent
method = lambda c: "cfg++"

solver_step = lambda c: euler_step
#combine_predictions = lambda c: true_noise_removal(c, [1], barycentric=True) if c.run_id % 2 == 0 else cfg_combiner(c)

#combine_predictions = old_combiner
combine_predictions = cfg_combiner
#combine_predictions = tnr_combiner
#combine_predictions = cons_combiner
#combine_predictions = simple
#combine_predictions = lambda c: lambda p, n: p[0]
#combine_predictions = single_prediction

embedding_distortion = lambda c: None#lambda i: 3 if i == 1 and c.embedding_index == 1 else 1

save_output = lambda c: True
save_approximates = lambda c: False
save_raw = lambda c: False


# -- Cell -- #


# # # models # # #

torch.set_grad_enabled(False)

with Timer("total"):
    with Timer("decoder"):
        decoder = Decoder()
        decoder.load_safetensors(decoder_model)
        decoder.to(device=decoder_device)

        #decoder = torch.compile(decoder, mode="default", fullgraph=True)

    with Timer("noise_predictor"):
        noise_predictor = UNet2DConditionModel.from_pretrained(
            noise_predictor_model, subfolder="unet", torch_dtype=noise_predictor_dtype
        )
        noise_predictor.to(device=main_device)

        # compilation will not actually happen until first use of noise_predictor
        # (as of torch 2.2.2) "default" provides the best result on my machine
        # don't use this if you're gonna be changing resolutions a lot
        #noise_predictor = torch.compile(noise_predictor, mode="default", fullgraph=True)

    with Timer("clip"):
        prompt_encoder = PromptEncoder(base_model, XL_MODEL, (clip_device, main_device), prompt_encoder_dtype)


# -- Cell -- #

# # # run # # #

variance_range = (0.00085, 0.012) # should come from model config!
forward_noise_schedule = default_variance_schedule(variance_range).to(main_dtype) # beta
forward_noise_total = forward_noise_schedule.cumsum(dim=0)
forward_signal_product = torch.cumprod((1 - forward_noise_schedule), dim=0) # alpha_bar
partial_signal_product = lambda s, t: torch.prod((1 - forward_noise_schedule)[s+1:t]) # alpha_bar_t / alpha_bar_s (but computed more directly from the forward noise)
part_noise = (1 - forward_signal_product).sqrt() # sigma
part_signal = forward_signal_product.sqrt() # mu?

def get_signal_ratio(from_timestep, to_timestep):
    if from_timestep < to_timestep: # forward
        return 1 / partial_signal_product(from_timestep, to_timestep).sqrt()
    else: # backward
        return partial_signal_product(to_timestep, from_timestep).sqrt()

def step_by_noise(latents, noise, from_timestep, to_timestep):
    signal_ratio = get_signal_ratio(from_timestep, to_timestep)
    return latents / signal_ratio + noise * (part_noise[to_timestep] - part_noise[from_timestep] / signal_ratio)

def stupid_simple_step_by_noise(latents, noise, from_timestep, to_timestep):
    signal_ratio = get_signal_ratio(from_timestep, to_timestep)
    return latents / signal_ratio + noise * (1 - 1 / signal_ratio)

def cfgpp_step_by_noise(latents, combined, base, from_timestep, to_timestep):
    signal_ratio = get_signal_ratio(from_timestep, to_timestep)
    return latents / signal_ratio + base * part_noise[to_timestep] - combined * (part_noise[from_timestep] / signal_ratio)

def tnr_step_by_noise(latents, diff_term, base_term, from_timestep, to_timestep):
    signal_ratio = get_signal_ratio(from_timestep, to_timestep)
    diff_coefficient = part_noise[from_timestep] / signal_ratio
    base_coefficient = part_noise[to_timestep] - diff_coefficient
    #print((1/signal_ratio).item(), base_coefficient.item(), diff_coefficient.item())
    return latents / signal_ratio + base_term * base_coefficient + diff_term * diff_coefficient

def tnrb_step_by_noise(latents, diff_term, base_term, from_timestep, to_timestep):
    signal_ratio = get_signal_ratio(from_timestep, to_timestep)
    base_coefficient = part_noise[to_timestep] - part_noise[from_timestep] / signal_ratio
    measure = lambda x: x.abs().max().item()
    #print(measure(latents / signal_ratio), measure(base_term * base_coefficient), measure(diff_term))
    return latents / signal_ratio + base_term * base_coefficient + diff_term

def shuffle_step(latents, first_noise, second_noise, timestep, intermediate_timestep):
    if from_timestep < to_timestep: # forward
        signal_ratio = 1 / partial_signal_product(timestep, intermediate_timestep).sqrt()
    else: # backward
        signal_ratio = partial_signal_product(intermediate_timestep, timestep).sqrt()
    return latents + (first_noise - second_noise) * (part_noise[intermediate_timestep] * signal_ratio - part_noise[timestep])

for run_id in run_ids:
    run_context = Context()
    run_context.run_id = run_id
    add_run_context(run_context)

    try:
        _seed = int(seed(run_context))
    except:
        _seed = 0
        print(f"non-integer seed, run {run_id}. replaced with 0.")

    torch.manual_seed(_seed)
    np.random.seed(_seed)

    run_context.steps = steps(run_context)

    diffusion_timesteps = linspace_timesteps(run_context.steps+1, timestep_max(run_context), timestep_min(run_context), timestep_power(run_context))

    run_prompts = prompts(run_context)

    noise_predictor_batch_size = len(run_prompts["encoder_1"])

    (all_penult_states, enc2_pooled) = prompt_encoder.encode(run_prompts["encoder_1"], run_prompts["encoder_2"], run_prompts["encoder_2_pooled"])

    for index in range(all_penult_states.shape[0]):
        run_context.embedding_index = index
        if embedding_distortion(run_context) is not None:
            all_penult_states[index] = svd_distort_embeddings(all_penult_states[index].to(main_dtype), embedding_distortion(run_context)).to(noise_predictor_dtype)

    width, height = width_height(run_context)

    if (width < 64): width *= 64
    if (height < 64): height *= 64

    #with torch.no_grad():
    decoder_dim_scale = 2 ** 3

    latents = torch.zeros(
        (1, noise_predictor.config.in_channels, height // decoder_dim_scale, width // decoder_dim_scale),
        device=main_device,
        dtype=main_dtype
    )


    noises = torch.randn(
        #(run_context.steps, 1, noise_predictor.config.in_channels, height // decoder_dim_scale, width // decoder_dim_scale),
        (1, 1, noise_predictor.config.in_channels, height // decoder_dim_scale, width // decoder_dim_scale),
        device=main_device,
        dtype=main_dtype
    )

    latents = step_by_noise(latents, noises[0], diffusion_timesteps[-1], diffusion_timesteps[0])
    modify_initial_latents(run_context, latents)

    original_size = (height, width)
    target_size = (height, width)
    crop_coords_top_left = (0, 0)

    # incomprehensible var name tbh go read the sdxl paper if u want to Understand
    add_time_ids = torch.tensor([list(original_size + crop_coords_top_left + target_size)], dtype=noise_predictor_dtype).repeat(noise_predictor_batch_size,1).to("cuda")

    added_cond_kwargs = {"text_embeds": enc2_pooled.to(noise_predictor_dtype), "time_ids": add_time_ids}


    out_index = 0
    with Timer("core loop"):
        for step_index in range(run_context.steps):
            step_context = Context(run_context)
            step_context.step_index = step_index
            add_step_context(step_context)

            #lerp_term = (part_signal[diffusion_timesteps[step_index]] + part_signal[diffusion_timesteps[step_index+1]]) / 2
            #step_context.sqrt_signal = part_signal[diffusion_timesteps[step_index+1]] ** 0.5
            #step_context.pnoise = (1-part_noise[diffusion_timesteps[step_index+1]]) ** 0.5
            #step_context.lerp_by_noise = lambda a, b: lerp(a, b, part_signal[diffusion_timesteps[step_index+1]] ** 0.5)

            noise = noises[0]


            start_timestep = index_interpolate(diffusion_timesteps, step_index).round().int()
            end_timestep = index_interpolate(diffusion_timesteps, step_index + 1).round().int()

            # ew TODO refactor this
            step_context.end_noise = part_noise[end_timestep]
            step_context.end_signal = part_signal[end_timestep]
            step_context.start_noise = part_noise[end_timestep]
            step_context.start_signal = part_signal[end_timestep]
            step_context.signal_ratio = get_signal_ratio(start_timestep, end_timestep)
            step_context.start = start_timestep
            step_context.end = end_timestep
            step_context.forward_noise_total = forward_noise_total

            #print(step_context.signal_ratio, step_context.end_signal, step_context.end_noise)

            sigratio = get_signal_ratio(start_timestep, end_timestep)
            #print("  S", ((2 - step_context.sqrt_signal) * part_noise[end_timestep] - part_noise[start_timestep] / sigratio).item())
            #print("1-S", ((step_context.sqrt_signal - 1) * part_noise[end_timestep] - part_noise[start_timestep] / sigratio).item())

            #latents = step_by_noise(latents, noise, diffusion_timesteps[-1], diffusion_timesteps[step_index])
            #latents = step_by_noise(latents, noise, diffusion_timesteps[-1], start_timestep)

            def predict_noise(latents, step=0):
                return noise_predictor(
                    latents.repeat(noise_predictor_batch_size, 1, 1, 1).to(noise_predictor_dtype),
                    index_interpolate(diffusion_timesteps, step_index + step).round().int(),
                    encoder_hidden_states=all_penult_states.to(noise_predictor_dtype),
                    return_dict=False,
                    added_cond_kwargs=added_cond_kwargs
                )[0]

            def standard_predictor(combiner):
                def _predict(latents, step=0):
                    predictions = predict_noise(latents, step)
                    return predictions, noise, combiner(predictions, noise)
                return _predict

            def constructive_predictor(combiner):
                def _predict(latents, step=0):
                    noised = step_by_noise(latents, noise, 0, index_interpolate(diffusion_timesteps, step_index + step).round().int())
                    predictions = predict_noise(noised, step)
                    return predictions, noise, combiner(latents, predictions, noise)
                return _predict


            def standard_diffusion_step(latents, noises, start, end):
                start_timestep = index_interpolate(diffusion_timesteps, step_index + start).round().int()
                end_timestep = index_interpolate(diffusion_timesteps, step_index + end).round().int()
                predictions, true_noise, combined_prediction = noises
                return step_by_noise(latents, combined_prediction, start_timestep, end_timestep)

            def stupid_simple_step(latents, noises, start, end):
                start_timestep = index_interpolate(diffusion_timesteps, step_index + start).round().int()
                end_timestep = index_interpolate(diffusion_timesteps, step_index + end).round().int()
                predictions, true_noise, combined_prediction = noises
                return stupid_simple_step_by_noise(latents, combined_prediction, start_timestep, end_timestep)

            def cfgpp_diffusion_step(choose_base, choose_combined):
                def _diffusion_step(latents, noises, start, end):
                    start_timestep = index_interpolate(diffusion_timesteps, step_index + start).round().int()
                    end_timestep = index_interpolate(diffusion_timesteps, step_index + end).round().int()
                    return cfgpp_step_by_noise(latents, choose_combined(noises), choose_base(noises), start_timestep, end_timestep)
                return _diffusion_step

            def tnr_diffusion_step(latents, noises, start, end):
                start_timestep = index_interpolate(diffusion_timesteps, step_index + start).round().int()
                end_timestep = index_interpolate(diffusion_timesteps, step_index + end).round().int()
                predictions, true_noise, combined_prediction = noises
                return tnr_step_by_noise(latents, combined_prediction, predictions[0], start_timestep, end_timestep)

            def tnrb_diffusion_step(latents, noises, start, end):
                start_timestep = index_interpolate(diffusion_timesteps, step_index + start).round().int()
                end_timestep = index_interpolate(diffusion_timesteps, step_index + end).round().int()
                predictions, true_noise, combined_prediction = noises
                return tnrb_step_by_noise(latents, combined_prediction, predictions[0], start_timestep, end_timestep)

            def constructive_step(latents, noises, start, end):
                start_timestep = index_interpolate(diffusion_timesteps, step_index + start).round().int()
                end_timestep = index_interpolate(diffusion_timesteps, step_index + end).round().int()
                predictions, true_noise, combined_prediction = noises
                return latents + combined_prediction

            def select_prediction(index):
                return lambda noises: noises[0][index]

            select_true_noise = lambda noises: noises[1]
            select_combined = lambda noises: noises[2]

            diffusion_method = method(step_context).lower()

            if diffusion_method == "standard":
                take_step = standard_diffusion_step
            if diffusion_method == "stupid":
                take_step = stupid_simple_step
            if diffusion_method == "cfg++":
                take_step = cfgpp_diffusion_step(select_prediction(0), select_combined)
            if diffusion_method == "tnr":
                take_step = tnr_diffusion_step
            if diffusion_method == "tnrb":
                take_step = tnrb_diffusion_step

            if diffusion_method == "cons":
                take_step = constructive_step
                get_derivative = constructive_predictor(combine_predictions(step_context))
            else:
                get_derivative = standard_predictor(combine_predictions(step_context))

            solver = solver_step(step_context)

            latents = solver(get_derivative, take_step, latents)

            if step_index < run_context.steps - 1 and diffusion_method != "cons":
                pred_original_sample = step_by_noise(latents, noise, diffusion_timesteps[step_index+1], diffusion_timesteps[-1])
                #pred_original_sample = step_by_noise(latents, noise, end_timestep, diffusion_timesteps[-1])
            else:
                pred_original_sample = latents

            #latents = step_by_noise(pred_original_sample, noises[0], diffusion_timesteps[-1], diffusion_timesteps[step_index])
            #latents = step_by_noise(latents, noises[0], diffusion_timesteps[-1], diffusion_timesteps[step_index])

            #latents = pred_original_sample

            if save_raw(step_context):
                save_raw_latents(pred_original_sample)
            if save_approximates(step_context):
                save_approx_decode(pred_original_sample, out_index)
                out_index += 1

            #if step_index > run_context.steps - 4:

        images_pil = pilify(pred_original_sample.to(device=decoder_device), decoder)

        for im in images_pil:
            display(im)

        if save_output(run_context):
            for n in range(len(images_pil)):
                images_pil[n].save(f"{settings_directory}/{n}_{run_id:05d}.png")


# -- Cell -- #

# # # save # # #

Path(daily_directory).mkdir(exist_ok=True, parents=True)
Path(f"{daily_directory}/{settings_id}_{run_id}").mkdir(exist_ok=True, parents=True)

for n in range(len(images_pil)):
    images_pil[n].save(f"{daily_directory}/{settings_id}_{run_id}/{n}.png")


# -- Cell -- #

steps = 1000
0.1 * 30 / steps, 0.01 * 30 / steps

# -- Cell -- #



# -- Cell -- #

