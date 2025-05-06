
import torch

# TODO implement CLIP models, remove transformers dep
from transformers import CLIPTokenizer, CLIPTextModel, CLIPTextModelWithProjection

class PromptEncoder(object):
    def __init__(self, model_source, is_xl, devices, torch_dtype):
        self.model_device, self.output_device = devices

        self.tokenizer = CLIPTokenizer.from_pretrained(
            model_source, subfolder="tokenizer", torch_dtype=torch_dtype
        )
        self.text_encoder = CLIPTextModel.from_pretrained(
            model_source, subfolder="text_encoder", torch_dtype=torch_dtype
        )
        self.text_encoder.to(device=self.model_device)
        if is_xl:
            self.tokenizer_2 = CLIPTokenizer.from_pretrained(
                model_source, subfolder="tokenizer_2", torch_dtype=torch_dtype
            )
            self.text_encoder_2 = CLIPTextModelWithProjection.from_pretrained(
                model_source, subfolder="text_encoder_2", torch_dtype=torch_dtype
            )
            self.text_encoder_2.to(device=self.model_device)

    def encoder_1(self, prompts):
        # [N_prompts, 77]
        # 77 tokens representing each prompt
        tokens = self.tokenizer(
            prompts,
            padding="max_length",
            max_length=self.tokenizer.model_max_length,
            truncation=True,
            return_tensors="pt",
        )

        with torch.no_grad():
            # penultimate hidden states
            # [N_prompts, 77, 768]
            # a 768-value vector for each token of each prompt
            enc1_penult_states = self.text_encoder(
                tokens.input_ids.to(device=self.model_device),
                output_hidden_states = True
            ).hidden_states[-2]

        return enc1_penult_states

    def encoder_2(self, prompts):
        # [N_prompts, 77]
        # 77 tokens representing each prompt
        tokens = self.tokenizer_2(
            prompts,
            padding="max_length",
            max_length=self.tokenizer_2.model_max_length,
            truncation=True,
            return_tensors="pt",
        )

        with torch.no_grad():
            enc2_out = self.text_encoder_2(
                tokens.input_ids.to(device=self.model_device),
                output_hidden_states = True
            )

        # [N_prompts, 77, 1280]
        # a 1280-value vector for each token of each prompt
        enc2_penult_states = enc2_out.hidden_states[-2]

        # [N_prompts, 1280]
        # a 1280-value vector for each entire prompt
        enc2_pooled = enc2_out.text_embeds

        return (enc2_penult_states, enc2_pooled)


    def encode(self, e1_prompts, e2_prompts=None, e2_pool_prompts=None):
        encoding1 = self.encoder_1(e1_prompts)
        if e2_prompts is None:
            e2_prompts = e1_prompts
        (encoding2, encoding2_pooled) = self.encoder_2(e2_prompts)
        if e2_pool_prompts is not None:
            (_, encoding2_pooled) = self.encoder_2(e2_pool_prompts)

        # [N_prompts, 77, 2048]
        # 2048-value vector for each token of each prompt, comprised of two embeddings
        return torch.cat([encoding1, encoding2], dim=-1).to(device=self.output_device), encoding2_pooled.to(device=self.output_device)

