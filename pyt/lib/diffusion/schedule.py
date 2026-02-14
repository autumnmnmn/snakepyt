
import torch
import numpy as np

def default_diffusion_timesteps(inference_steps, training_steps=1000):
    step_spacing = training_steps // inference_steps
    return (torch.arange(inference_steps - 1, -1, -1) * step_spacing).round() + 1

def linspace_timesteps(step_count, max_step=999, min_step=0, power=1):
    steps = torch.linspace(1, 0, step_count, dtype=torch.float64).pow(power).mul(max_step-min_step).add(min_step).round().int()
    return steps

def default_variance_schedule(variance_range, training_steps=1000):
    variance_start, variance_end = variance_range
    return torch.linspace(variance_start**0.5, variance_end**0.5, training_steps)**2

# mathematically equivalent to hf diffusers' default euler scheduler sigmas
def default_sigmas(forward_variance_schedule, diffusion_timesteps):
    inverse_variance_complement_cumprod = torch.cumprod(1/(1 - forward_variance_schedule), dim=0)
    sqrt_inv_snr = (inverse_variance_complement_cumprod - 1) ** 0.5
    return torch.from_numpy(np.concatenate([np.interp(diffusion_timesteps, np.arange(0, len(sqrt_inv_snr)), sqrt_inv_snr), [0.0]]))

