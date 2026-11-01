
struct Uniforms /* buffer 0 0 */ {
    mode: u32, // hard 0 to hard 2 = 0 $select(lyapunov, fprime, x)
    negative_scale: f32, // -7 to 7 = 1
    negative_scale_b: f32, // -7 to 7 = 1
    positive_scale: f32, // -7 to 7 = 1
    positive_scale_b: f32, // -7 to 7 = 1
    offset: f32, // -5 to 5 = 0
    background_color: vec3f, // $color(var(--main-background))
    pos_color: vec3f, // $color
    neg_color: vec3f, // $color
    curves: u32, // hard 0 to hard 1 = 0 $bool
    target_value: f32, // -1 to 1 = 0 $depend(curves=true)
    edge_multiplier: f32, // 0 to 1 = 0.5 $depend(curves=true)
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@group(0) @binding(1) var tex: texture_2d<f32>;

$paste(core.wgsl);



struct Sample {
    h:  f32,   // pick - target_value at this texel
    ok: bool,  // false = undefined texel (inf/NaN), excluded from all tests
};

fn sampleH(coord: vec2<i32>) -> Sample {
    // clamp: out-of-bounds textureLoad is undefined in WGSL
    let dim = vec2<i32>(textureDimensions(tex));
    let cc  = clamp(coord, vec2<i32>(0, 0), dim - vec2<i32>(1, 1));
    let raw = textureLoad(tex, cc, 0);
    if (hacky_isinf(raw.r)) {              // your existing "undefined" marker
        return Sample(0.0, false);
    }
    var v = raw + uniforms.offset;
    var p = v.r;
    if (uniforms.mode == 1u) { p = v.g; }
    if (uniforms.mode == 2u) { p = v.b; }
    if (p != p || abs(p) > 1e30) {         // NaN / inf in the picked channel
        return Sample(0.0, false);
    }
    return Sample(p - uniforms.target_value, true);
}

// True if the level set passes through the 3-texel window [L, C, R]:
// a crossing (sign change), or a tangency (the parabola through the 3
// samples reaches the target at its vertex inside the window).
fn levelSetHit(L: Sample, C: Sample, R: Sample) -> bool {
    if (!L.ok || !C.ok || !R.ok) { return false; }

    // 1) crossing / exact touch on a texel: window straddles the target
    if (min(min(L.h, C.h), R.h) <= 0.0 && max(max(L.h, C.h), R.h) >= 0.0) {
        return true;
    }

    // 2) tangency between texels. Case 1 already handled mixed signs,
    //    so here the whole window is on one side (L's sign = window's sign).
    let d = L.h - 1.0 * C.h + R.h;             // 2 * local curvature
    if (abs(d) < 1e-25) { return false; }      // (near-)linear window: no turn inside
    let b      = 0.5 * (R.h - L.h);            // central slope
    let vertex = C.h - (b * b) / (2.0 * d);    // value of the extremum
    let inside = abs(b) <= abs(d);             // extremum within +-1 texel of C

    if (L.h > 0.0 && d > 0.0 && inside && vertex <= 0.0) { return true; } // dips to target from above, turns back
    if (L.h < 0.0 && d < 0.0 && inside && vertex >= 0.0) { return true; } // rises to target from below, turns back
    return false;
}





@vertex
fn vert(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4<f32> {
    // fullscreen quad
    let pos = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
        vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0)
    );
    return vec4<f32>(pos[vertex_index], 0.0, 1.0);
}

@fragment
fn frag(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
    let texel_coord = vec2<i32>(frag_coord.xy);

    var val = textureLoad(tex, texel_coord, 0) + uniforms.offset;

    let isnan = hacky_isinf(val.r);
    let prime = val.g;
    let lyap = val.r;
    let x = val.b;

    var pick = lyap;

    if (uniforms.mode == 1) {
        pick = prime;
    }
    if (uniforms.mode == 2) {
        pick = x;
    }

    if (uniforms.curves == 5u) {
        let du = fwidthFine(pick);

        let edge = du * uniforms.edge_multiplier;

        let absTarget = abs(pick - uniforms.target_value);

        let contour = smoothstep(edge, edge * 2 , absTarget);

        val = vec4<f32>(contour, contour, contour, 1.0);

        return select(val, vec4<f32>(uniforms.background_color, 1.0), isnan);
    }

    if (uniforms.curves == 1u) {
        let du = fwidthFine(pick);
        let edge = du * uniforms.edge_multiplier;
        let absTarget = abs(pick - uniforms.target_value);

        // structural pass: crossings + touch-and-turn-around
        let c   = texel_coord;
        let sC  = sampleH(c);
        let sLx = sampleH(c + vec2<i32>(-1, 0));
        let sRx = sampleH(c + vec2<i32>( 1, 0));
        let sLy = sampleH(c + vec2<i32>( 0, -1));
        let sRy = sampleH(c + vec2<i32>( 0, 1));
        let hit = levelSetHit(sLx, sC, sRx)    // folds in x
               || levelSetHit(sLy, sC, sRy);   // folds in y

        var contour = smoothstep(edge, edge * 2.0, absTarget);  // value band: unchanged
        if (hit) {
            contour = 0.0;  // level set passes through this texel's window:
                             // force the line on even where the band collapsed
        }
        val = vec4<f32>(contour, contour, contour, 1.0);
        return select(val, vec4<f32>(uniforms.background_color, 1.0), isnan);
    }

    //val.g = select(0.0, 1.0 - exp(val.r * uniforms.negative_scale), val.r < 0.0);
    //val.b = select(0.0, val.r * uniforms.positive_scale, val.r > 0.0);
    //val.r = max(val.g, val.b);
    var neg_term = uniforms.negative_scale_b * exp(pick * abs(uniforms.negative_scale));
    var pos_term = uniforms.positive_scale_b * exp(-pick * abs(uniforms.positive_scale));//1.0 - exp(-val.r * abs(uniforms.positive_scale));

    if (uniforms.negative_scale > 0.0) {
        neg_term = 1.0 - neg_term;
    }

    if (uniforms.positive_scale > 0.0) {
        pos_term = 1.0 - pos_term;
    }

    //let val3 = select(neg_term * uniforms.neg_color, val.r * uniforms.positive_scale * uniforms.pos_color, val.r > 0.0);
    let val3 = select(neg_term * uniforms.neg_color, pos_term * uniforms.pos_color, pick > 0.0);

    val = vec4<f32>(val3, 1.0);
    //val.a = 1.0;

    return select(val, vec4<f32>(uniforms.background_color, 1.0), isnan);
}

