
import torch

from pyt.lib.util import lerp

def scaled_CFG(difference_scales, steering_scale, base_term, total_scale):
    def combine_predictions(predictions, true_noise):
        base = base_term(predictions, true_noise)
        steering = base * 0
        len_predictions = len(predictions)
        for (a,b,scale) in difference_scales:
            if a >= len_predictions or b >= len_predictions: continue
            prediction_a = true_noise if a < 0 else predictions[a]
            prediction_b = true_noise if b < 0 else predictions[b]
            steering += scale(prediction_a - prediction_b)
        return total_scale(predictions, base + steering_scale(steering))
    return combine_predictions

def single_prediction(context):
    def combine_predictions(predictions, true_noise):
        S = 2 - context.sqrt_signal
        return predictions[0] * S + true_noise * (1 - S)
    return combine_predictions

def true_noise_removal(context, relative_scales, barycentric=True):
    def combine_predictions(predictions, true_noise):
        if len(predictions) == 1:
            return single_prediction(context)(predictions, true_noise)

        steering = torch.zeros_like(true_noise)
        scales = torch.tensor(relative_scales, dtype=true_noise.dtype)

        barycenter = predictions.sum(dim=0) / len(predictions)

        for index in range(len(predictions)):
            if barycentric:
                steering += scales[index] * (predictions[index] - barycenter)
            else:
                steering += scales[index] * (predictions[index] - true_noise)

        S = 2 - context.sqrt_signal
        #print(context.signal)
        #return steering + lerp(true_noise, barycenter, 1 - context.noise)
        #return S * steering + S * (barycenter) #+ (1 - S) * (true_noise)
        #return (S - 1) * steering + S * barycenter + (1 - S) * (true_noise)
        return S * (barycenter + steering) + (1 - S) * (true_noise)
        #return (S-1) * steering + S * (barycenter) + (1 - S) * (true_noise - steering)
        #return  S * (barycenter + steering) + (1 - S) * (true_noise - steering)
    return combine_predictions

def apply_dynthresh(predictions_split, noise_prediction, target, percentile):
    target_prediction = predictions_split[1] + target * (predictions_split[1] - predictions_split[0])
    flattened_target = torch.flatten(target_prediction, 2)
    target_mean = flattened_target.mean(dim=2)
    for dim_index in range(flattened_target.shape[1]):
        flattened_target[:,dim_index] -= target_mean[:,dim_index]
    target_thresholds = torch.quantile(flattened_target.abs().float(), percentile, dim=2)
    flattened_prediction = torch.flatten(noise_prediction, 2)
    prediction_mean = flattened_prediction.mean(dim=2)
    for dim_index in range(flattened_prediction.shape[1]):
        flattened_prediction[:,dim_index] -= prediction_mean[:,dim_index]
    thresholds = torch.quantile(flattened_prediction.abs().float(), percentile, dim=2)
    for dim_index in range(noise_prediction.shape[1]):
        noise_prediction[:,dim_index] -= prediction_mean[:,dim_index]
        noise_prediction[:,dim_index] *= target_thresholds[:,dim_index] / thresholds[:,dim_index]
        noise_prediction[:,dim_index] += prediction_mean[:,dim_index]

def apply_naive_rescale(predictions_split, noise_prediction):
    get_scale = lambda p: torch.linalg.vector_norm(p, ord=2).item() / p.numel()
    norms = [get_scale(x) for x in predictions_split]
    natural_scale = sum(norms) / len(norms)
    final_scale = get_scale(noise_prediction)
    noise_prediction *= natural_scale / final_scale

