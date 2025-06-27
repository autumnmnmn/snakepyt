import torch as t;from PIL import Image as I;w,h,iters,save_every,r,dt,conv=2**9,2**9,100000,1,10,0.005,lambda f,k:t.nn.functional.conv2d(f.unsqueeze(0),k,bias=None,padding=[0],stride=[1])[0]
t.set_default_device("cuda");kd,kph,kpv=t.tensor([[[[0,1.0,0],[1,0,1],[0,1,0]]]]),t.tensor([[[[0,0,0],[1.0,0,-1],[0,0,0]]]]),t.tensor([[[[0,1.0,0],[0,0,0],[0,-1,0]]]])
def bd(f,lt=lambda t:(t[0],t[1])):f[(0,-1)],f[:,(0,-1)]=lt((f[(1,-2)],f[:,(1,-2)]));f[(0,0,-1,-1),(0,-1,0,-1)]=0.5*(f[(0,0,-2,-2),(1,-2,0,-1)]+f[(1,1,-1,-1),(0,-1,1,-2)])
ind,lim=t.stack((t.arange(1,h-1,dtype=t.float).repeat(w-2,1).t(),t.arange(1,w-1,dtype=t.float).repeat(h-2,1))),1/(dt*1.4142)
def adv(f, v):
    off=ind.clone().add_(dt*v[:,1:h-1,1:w-1]);off[1].clamp_(1.5,w-2.5);off[0].clamp_(1.5,h-2.5);ind_int=off.int()
    inv_off,next_ind=1-off.sub_(ind_int),ind_int+1;i=(t.stack([ind_int[0],ind_int[0],next_ind[0],next_ind[0]]),t.stack([ind_int[1],next_ind[1],ind_int[1],next_ind[1]]))
    res,values=t.zeros_like(f),t.stack([f[:,1:h-1,1:w-1]*inv_off[1]*inv_off[0],f[:,1:h-1,1:w-1]*off[1]*inv_off[0],f[:,1:h-1,1:w-1]*inv_off[1]*off[0],f[:,1:h-1,1:w-1]*off[1]*off[0]])
    res[0].index_put_(i,values[:,0,:,:],accumulate=True)
    if f.shape[0]==1:bd(res[0])
    else:res[1].index_put_(i,values[:,1,:,:],accumulate=True);bd(res[1],lambda t:(-t[0],t[1]));bd(res[0],lambda t:(t[0],-t[1]))
    return res
def proj(f):
    div,p=(conv(f[1],kph)+conv(f[0],kpv))*0.5,t.zeros_like(f[0]);bd(div)
    for i in range(80):p[1:h-1,1:w-1]=(div+conv(p,kd))/4;bd(p)
    f[1,1:h-1,1:w-1]+=0.5*conv(p,kph);f[0,1:h-1,1:w-1]+=0.5*conv(p,kpv);bd(f[1],lambda t:(-t[0],t[1]));bd(f[0],lambda t:(t[0],-t[1]))
v,d,i=t.nn.Upsample(size=[h,w],mode='bilinear')((t.randn([2,h//128,w//128])*50).unsqueeze(0))[0],t.ones([1,h,w])*0.1,1
d[0,:,tuple(x*w//20 for x in range(20))]+=0.8;d[0,tuple(x*h//20 for x in range(20)),:]+=0.8
for it in range(iters):
    v.nan_to_num_(0);
    d.add_(0.003);v[1,h//3:2*h//3,w//8].add_(40).clamp_(-lim,lim);v[0,1:h-1,1:w-1]=(v[0,1:h-1,1:w-1]+dt*r*conv(v[0],kd))/(1+4*dt*r)
    v[1,1:h-1,1:w-1]=(v[1,1:h-1,1:w-1]+dt*r*conv(v[1],kd))/(1+4*dt*r);bd(v);proj(v);v=adv(v,v);proj(v);d=adv(d,v).sub_(0.003).clamp_(0,1)
    print(f"{it}: {t.count_nonzero(t.isnan(v.view(-1))).item()} v nans")
    if it%save_every == 0:
        i+=1
        I.fromarray(d[0].detach().clone().clamp_(0,1).mul_(255).round().type(t.uint8).unsqueeze(2).expand(-1,-1,3).cpu().numpy()).save(f"out/densities/{i:06d}.png")
        #I.fromarray(t.cat((v.isnan(),t.zeros_like(v[0]).unsqueeze(0))).detach().clone().clamp_(0,1).mul_(255).round().type(t.uint8).permute(1,2,0).cpu().numpy()).save(f"out/velocities/nan_{i:06d}.png")
        I.fromarray(t.cat(((0.5 + 0.5 * v / t.sqrt(v[0]**2 + v[1]**2)), t.zeros_like(v[0]).unsqueeze(0))).detach().clone().clamp_(0,1).mul_(255).round().type(t.uint8).permute(1,2,0).cpu().numpy()).save(f"out/velocities/dir_{i:06d}.png")
        #I.fromarray((0.5 + 0.5 * (v[0]**2+v[1]**2) / (v[0]**2 + v[1]**2).abs().max()).detach().clone().clamp_(0,1).mul_(255).round().type(t.uint8).unsqueeze(2).expand(-1,-1,3).cpu().numpy()).save(f"out/velocities/mag_{i:06d}.png")

