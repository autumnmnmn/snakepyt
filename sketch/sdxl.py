import math
import gc

import torch
import numpy as np
import torch.nn as nn
from torch.nn import functional as func
from PIL import Image

from diffusers import UNet2DConditionModel
import transformers

from lib.diffusion.guidance import *
from lib.diffusion.schedule import *
from lib.diffusion.sdxl_encoder import PromptEncoder
from lib.diffusion.sdxl_vae import Decoder, save_approx_decode

from lib.ode import _euler_step as euler_step
from lib.log import Timer
#from lib.util import pilify

'''
beware: this file is a mess, lots of things are broken and poorly named
'''

def save_raw_latents(latents, path):
    lmin = latents.min()
    l = latents - lmin
    lmax = latents.max()
    l = latents / lmax
    l = l.float() * 127.5 + 127.5
    l = l.detach().cpu().numpy()
    l = l.round().astype("uint8")

    ims = []

    for lat in l:
        row1 = np.concatenate([lat[0], lat[1]])
        row2 = np.concatenate([lat[2], lat[3]])
        grid = np.concatenate([row1, row2], axis=1)
        #for channel in lat:
        im = Image.fromarray(grid)
        im = im.resize(size=(grid.shape[1]*4, grid.shape[0]*4), resample=Image.NEAREST)
        ims += [im]

    for im in ims:
        im.save(path)


def pilify(latents, vae):
    #latents = 1 / vae.config.scaling_factor * latents
    latents = 1 / 0.13025 * latents
    latents = latents.to(torch.float32)#vae.dtype)
    with torch.no_grad():
        images = vae.decode(latents)#.sample

    images = images.detach().mul_(127.5).add_(127.5).clamp_(0,255).round()
    #return [images]
    images = images.permute(0,2,3,1).cpu().numpy().astype("uint8")
    return [Image.fromarray(image) for image in images]


torch.set_grad_enabled(False)
torch.backends.cuda.matmul.allow_tf32 = True
torch.set_float32_matmul_precision("medium")

def persistent():
    model_path = "/ssd/0/ml_models/ql/hf-diff/stable-diffusion-xl-base-0.9"

    main_device = "cuda:0"
    decoder_device = "cuda:1"
    clip_device = "cuda:1"

    main_dtype = torch.float64
    noise_predictor_dtype = torch.float16
    decoder_dtype = torch.float32
    prompt_encoder_dtype = torch.float16

    with Timer("total"):
        with Timer("decoder"):
            decoder = Decoder()
            decoder.load_safetensors(model_path)
            decoder.to(device=decoder_device)
            #decoder = torch.compile(decoder, mode="default", fullgraph=True)

        with Timer("noise_predictor"):
            noise_predictor = UNet2DConditionModel.from_pretrained(
                model_path, subfolder="unet", torch_dtype=noise_predictor_dtype
            )
            noise_predictor.to(device=main_device)

            # compilation will not actually happen until first use of noise_predictor
            # (as of torch 2.2.2) "default" provides the best result on my machine
            # don't use this if you're gonna be changing resolutions a lot
            #noise_predictor = torch.compile(noise_predictor, mode="default", fullgraph=True)

        with Timer("clip"):
            prompt_encoder = PromptEncoder(model_path, True, (clip_device, main_device), prompt_encoder_dtype)



# TODO: these should come from config!
vae_scale = 0.13025
decoder_dim_scale = 2 ** 3
variance_range = (0.00085, 0.012)


seed = lambda run, meta: 23333 + run

meta_count = 1

width, height = 16, 20

steps = 50
run_count = 10

timestep_power = 1
timestep_range = (0, 999)

from sketch.local.prompts import *

empty_p = ""

prompts = {
    "encoder_1": [p8, p3],
    "encoder_2": None,
    "encoder_2_pooled": None
}
_lerp = lambda t, a, b: t * b + (1-t) * a

clip_skip = lambda r, m: 0
clip_skip_2 = lambda r, m: 0

combine_predictions = lambda s,r: scaled_CFG(
    difference_scales = [
        (1, -1, lambda x: x)
        #(1, 0, lambda x: _lerp(s/steps, 1.0, 0.3) * x),
        #(2, 0, lambda x: _lerp(s/steps, 0.3, 1.0) * x),
    ],
    steering_scale = lambda x: 1 * x,
    #base_term = lambda predictions, true_noise: predictions[0],
    base_term = lambda predictions, true_noise: true_noise,
    total_scale = lambda predictions, cfg_result: cfg_result
)

# TNR
_scale = lambda step, scale: _lerp(step / (steps - 1), scale / steps, 0.1 * scale / steps)
a,b,c = -7, 10, 15
#combine_predictions = lambda step, run: lambda p, n: _scale(step, a + c * run / (run_count-1)) * (n - p[0]) + _scale(step, b - c * run / (run_count-1)) * (n - p[1])
#combine_predictions = lambda step, run: lambda p, n: _scale(step, 4) * (n - p[1]) + _scale(step, 2.5) * (p[0] - n)
combine_predictions = lambda step, run: lambda p, n: _scale(step, 3) * (n - p[0]) * 0.5 + _scale(step, 3) * (n - p[1]) * 0.5
#combine_predictions = lambda step, run: lambda p, n: _scale(step, _lerp(step/steps, 0.0, 0.0)) * (n - p[0]) + _scale(step, 2) * (n - p[1])


diffusion_method = "tnr"

solver_step = euler_step

save_raw = lambda run, step: False
save_approximates = lambda run, step: False #step % 5 == 0
save_final = True

def pre_step(step, latents):
    return latents

def post_step(step, latents):
    return latents

def main():

    schedule(meta_run, range(meta_count))

def meta_run(meta_id):
    forward_noise_schedule = default_variance_schedule(variance_range).to(main_dtype) # beta
    forward_noise_total = forward_noise_schedule.cumsum(dim=0)
    forward_signal_product = torch.cumprod((1 - forward_noise_schedule), dim=0) # alpha_bar
    partial_signal_product = lambda s, t: torch.prod((1 - forward_noise_schedule)[s+1:t]) # alpha_bar_t / alpha_bar_s (but computed more directly from the forward noise)
    part_noise = (1 - forward_signal_product).sqrt() # sigma
    part_signal = forward_signal_product.sqrt() # mu?

    schedule(run, range(run_count))

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

def index_interpolate(source, index):
    frac, whole = math.modf(index)
    if frac == 0:
        return source[int(whole)]
    return lerp(source[int(whole)], source[int(whole)+1], frac)

def run(run_id):
    try:
        _seed = int(seed(run_id, meta_id))
    except:
        _seed = 0
        print(f"non-integer seed, run {run_id}. replaced with 0.")

    torch.manual_seed(_seed)
    np.random.seed(_seed)

    diffusion_timesteps = linspace_timesteps(steps+1, timestep_range[1], timestep_range[0], timestep_power)

    noise_predictor_batch_size = len(prompts["encoder_1"])

    enc1 = prompt_encoder.text_encoder.text_model.encoder
    enc2 = prompt_encoder.text_encoder_2.text_model.encoder

    if not hasattr(enc1, "___orig_layers"):
        enc1.___orig_layers = enc1.layers

    if not hasattr(enc2, "___orig_layers"):
        enc2.___orig_layers = enc2.layers

    kept_layers = len(enc1.___orig_layers) - clip_skip(run_id, meta_id)
    kept_layers_2 = len(enc2.___orig_layers) - clip_skip_2(run_id, meta_id)

    enc1.layers = torch.nn.ModuleList(enc1.___orig_layers[:kept_layers])
    enc2.layers = torch.nn.ModuleList(enc2.___orig_layers[:kept_layers_2])

    (all_penult_states, enc2_pooled) = prompt_encoder.encode(prompts["encoder_1"], prompts["encoder_2"], prompts["encoder_2_pooled"])

    global width
    global height
    if (width < 64): width *= 64
    if (height < 64): height *= 64

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

    original_size = (height, width)
    target_size = (height, width)
    crop_coords_top_left = (0, 0)

    # incomprehensible var name tbh go read the sdxl paper if u want to Understand
    add_time_ids = torch.tensor([list(original_size + crop_coords_top_left + target_size)], dtype=noise_predictor_dtype).repeat(noise_predictor_batch_size,1).to("cuda")

    added_cond_kwargs = {"text_embeds": enc2_pooled.to(noise_predictor_dtype), "time_ids": add_time_ids}

    for step_index in range(steps):
        noise = noises[0]

        start_timestep = index_interpolate(diffusion_timesteps, step_index).round().int()
        end_timestep = index_interpolate(diffusion_timesteps, step_index + 1).round().int()

        end_noise = part_noise[end_timestep]
        end_signal = part_signal[end_timestep]
        start_noise = part_noise[start_timestep]
        start_signal = part_signal[start_timestep]
        signal_ratio = get_signal_ratio(start_timestep, end_timestep)
        start = start_timestep
        end = end_timestep


        sigratio = get_signal_ratio(start_timestep, end_timestep)

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
            get_derivative = constructive_predictor(combine_predictions)
        else:
            get_derivative = standard_predictor(combine_predictions(step_index, run_id))

        solver = solver_step

        latents = pre_step(step_index, latents)

        latents = solver(get_derivative, take_step, latents)

        latents = post_step(step_index, latents)

        if step_index < steps - 1 and diffusion_method != "cons":
            pred_original_sample = step_by_noise(latents, noise, diffusion_timesteps[step_index+1], diffusion_timesteps[-1])
        else:
            pred_original_sample = latents

        if save_raw(run_id, step_index):
            save_raw_latents(pred_original_sample, f"out/{run_dir}/{run_id}_raw_{step_index:03d}.png")
        if save_approximates(run_id, step_index):
            save_approx_decode(pred_original_sample, f"out/{run_dir}/{run_id}_approx_{step_index:03d}.png")

    if save_final:
        images_pil = pilify(pred_original_sample.to(device=decoder_device), decoder)

        for im in images_pil:
            for n in range(len(images_pil)):
                images_pil[n].save(f"out/{run_dir}/{meta_id:05d}_{n}_{run_id:05d}_{step_index:05d}.png")


