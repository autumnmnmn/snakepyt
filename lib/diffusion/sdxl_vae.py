
import torch
import torch.nn as nn
from torch.nn import functional as func
from safetensors import safe_open as st_open
from PIL import Image

class Attention(nn.Module):
    def __init__(self):
        super().__init__()

        self.n_head = 1
        self.group_norm = nn.GroupNorm(32, 512)
        self.to_q = nn.Linear(512, 512)
        self.to_k = nn.Linear(512, 512)
        self.to_v = nn.Linear(512, 512)
        self.to_out = nn.ModuleList([nn.Linear(512, 512)])

    def forward(self, x):
        b, c, h, w = x.size()

        y = x.view(b, c, h * w)

        y = self.group_norm(y).transpose(1,2)

        q = self.to_q(y).view(b, h*w, 1, c).transpose(1, 2)
        k = self.to_k(y).view(b, h*w, 1, c).transpose(1, 2)
        v = self.to_v(y).view(b, h*w, 1, c).transpose(1, 2)

        y = func.scaled_dot_product_attention(q, k, v).transpose(1,2).view(b, h*w, c)

        y = self.to_out[0](y).transpose(-1,-2).view(b, c, h, w)

        return x + y

class ResnetBlock(nn.Module):
    def __init__(self, size_in, size_out):
        super().__init__()

        self.sizes = (size_in, size_out)

        self.norm1 = nn.GroupNorm(32, size_in, eps=1e-06)
        self.conv1 = nn.Conv2d(size_in, size_out, kernel_size=3, padding=1)

        self.norm2 = nn.GroupNorm(32, size_out, eps=1e-06)
        self.conv2 = nn.Conv2d(size_out, size_out, kernel_size=3, padding=1)

        if size_in != size_out:
            self.conv_shortcut = nn.Conv2d(size_in, size_out, kernel_size=1)
        else:
            self.conv_shortcut = None

        self.silu = nn.SiLU()

    def forward(self, x):
        h = self.norm1(x)
        h = self.silu(h)
        h = self.conv1(h)

        h = self.norm2(h)
        h = self.silu(h)
        h = self.conv2(h)

        if self.conv_shortcut is not None:
            x = self.conv_shortcut(x)

        return x + h


class UpSampler(nn.Module):
    def __init__(self, size):
        super().__init__()
        self.conv = nn.Conv2d(size, size, kernel_size=3, padding=1)

    def forward(self, x):
        x_interp = func.interpolate(x, scale_factor=2.0, mode="nearest-exact")
        return self.conv(x_interp)

class UpBlock(nn.Module):
    def __init__(self, size_in, size_out, include_upsampler=True):
        super().__init__()

        self.resnets = nn.ModuleList([
            ResnetBlock(size_in, size_out),
            ResnetBlock(size_out, size_out),
            ResnetBlock(size_out, size_out)
        ])

        if (include_upsampler):
            self.upsamplers = nn.ModuleList([UpSampler(size_out)])
        else:
            self.upsamplers = None

    def forward(self, x):
        h = x
        for net in self.resnets:
            h = net(h)
        if self.upsamplers is not None:
            h = self.upsamplers[0](h)
        return h

class Decoder(nn.Module):
    def __init__(self):
        super().__init__()

        self.decoder = nn.ModuleDict(dict(
            conv_in = nn.Conv2d(in_channels=4, out_channels=512, kernel_size=3, padding=1),
            up_blocks = nn.ModuleList([
                UpBlock(512, 512),
                UpBlock(512, 512),
                UpBlock(512, 256),
                UpBlock(256, 128, False)
            ]),
            mid_block = nn.ModuleDict(dict(
                attentions = nn.ModuleList([Attention()]),
                resnets = nn.ModuleList([
                    ResnetBlock(512, 512),
                    ResnetBlock(512, 512)
                ])
            )),
            conv_norm_out = nn.GroupNorm(32, 128, eps=1e-06),
            conv_out = nn.Conv2d(128, 3, kernel_size=3, padding=1)
        ))

        self.post_quant_conv = nn.Conv2d(4, 4, kernel_size=1)

        self.silu = nn.SiLU()

    def decode(self, x):
        x = self.post_quant_conv(x)
        x = self.decoder.conv_in(x)

        x = self.decoder.mid_block.resnets[0](x)
        for attn, net in zip(self.decoder.mid_block.attentions, self.decoder.mid_block.resnets[1:]):
            if (attn is not None):
                y = attn(x)
                x = y
            y = net(x)
            x = y

        for block in self.decoder.up_blocks:
            x = block(x)
        x = self.decoder.conv_norm_out(x)
        x = self.silu(x)
        return self.decoder.conv_out(x)

    def load_safetensors(self, model_directory, direct=False):
        if direct:
            path = model_directory
        else:
            path = f"{model_directory}/vae/diffusion_pytorch_model.safetensors"
        sd = self.state_dict()
        with st_open(path, framework="pt") as file:
            for key in sd.keys():
                sd[key].copy_(file.get_tensor(key))

approximation_matrix = [
    [0.85, 0.85, 0.6], # seems to be mainly value
    [-0.35, 0.2, 0.5], # mainly blue? maybe a little green, def not red
    [0.15, 0.15, 0], # yellow. but mainly encoding texture not color, i think
    [0.15, -0.35, -0.35] # inverted value? but also red
]

def save_approx_decode(latents, path):
    lmin = latents.min()
    l = latents - lmin
    lmax = latents.max()
    l = latents / lmax
    l = l.float().mul_(0.5).add_(0.5)
    ims = []
    for lat in l:
        apx_mat = torch.tensor(approximation_matrix).to("cuda")
        approx_decode = torch.einsum("...lhw,lr -> ...rhw", lat, apx_mat).mul_(255).round()
        #lat -= lat.min()
        #lat /= lat.max()
        im_data = approx_decode.permute(1,2,0).detach().cpu().numpy().astype("uint8")
        #im_data = im_data.round().astype("uint8")
        im = Image.fromarray(im_data).resize(size=(im_data.shape[1]*8,im_data.shape[0]*8), resample=Image.NEAREST)
        ims += [im]

    #clear_output()
    for im in ims:
        #im.save(f"out/tmp_approx_decode/{index:06d}.bmp")
        im.save(path)
        #display(im)

