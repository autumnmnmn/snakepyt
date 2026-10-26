struct Uniforms /* buffer 0 0 */ {
    max_iterations: f32,
    escape_span: f32, // hard 0.05 to 1.5 = 0.8
    activity_gain: f32, // hard 0.1 to 100 = 20
    magnitude_weight: f32, // 0 to 1 = 0.22
    seam_strength: f32, // 0 to 1 = 0.45
    mode: u32, // hard 0 to hard 3 = 0 $select(portrait,escape-time,tail-activity,mean-magnitude)
    color_controls: u32, // hard 0 to hard 1 = 0 $bool
    escape_0: vec3f, // $color $depend(color_controls=true)
    escape_1: vec3f, // $color $depend(color_controls=true)
    escape_2: vec3f, // $color $depend(color_controls=true)
    escape_3: vec3f, // $color $depend(color_controls=true)
    escape_4: vec3f, // $color $depend(color_controls=true)
    interior_0: vec3f, // $color $depend(color_controls=true)
    interior_1: vec3f, // $color $depend(color_controls=true)
    interior_2: vec3f, // $color $depend(color_controls=true)
    interior_3: vec3f, // $color $depend(color_controls=true)
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var tex: texture_2d<f32>;

fn log1p(x: f32) -> f32 {
    return log(1.0 + x);
}

fn escape_palette(t: f32) -> vec3f {
    let x = clamp(t, 0.0, 1.0);
    if (x < 0.24) {
        return mix(uniforms.escape_0, uniforms.escape_1, x / 0.24);
    }
    if (x < 0.50) {
        return mix(uniforms.escape_1, uniforms.escape_2, (x - 0.24) / 0.26);
    }
    if (x < 0.76) {
        return mix(uniforms.escape_2, uniforms.escape_3, (x - 0.50) / 0.26);
    }
    return mix(uniforms.escape_3, uniforms.escape_4, (x - 0.76) / 0.24);
}

fn interior_palette(t: f32) -> vec3f {
    let x = clamp(t, 0.0, 1.0);
    if (x < 0.35) {
        return mix(uniforms.interior_0, uniforms.interior_1, x / 0.35);
    }
    if (x < 0.70) {
        return mix(uniforms.interior_1, uniforms.interior_2, (x - 0.35) / 0.35);
    }
    return mix(uniforms.interior_2, uniforms.interior_3, (x - 0.70) / 0.30);
}

@vertex
fn vert(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4f {
    let pos = array<vec2f, 6>(
        vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
        vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0)
    );
    return vec4f(pos[vertex_index], 0.0, 1.0);
}

@fragment
fn frag(@builtin(position) frag_coord: vec4f) -> @location(0) vec4f {
    let data = textureLoad(tex, vec2i(frag_coord.xy), 0);
    let escaped = data.a > 0.5;

    let escape_t = clamp(
        log1p(max(data.r, 0.0)) /
            max(0.001, log1p(uniforms.max_iterations) * uniforms.escape_span),
        0.0,
        1.0
    );
    let activity_t = clamp(
        log1p(uniforms.activity_gain * max(data.g, 0.0)) /
            log1p(uniforms.activity_gain * 4.0),
        0.0,
        1.0
    );
    let magnitude_t = clamp(log1p(max(data.b, 0.0)) / log(3.0), 0.0, 1.0);
    let interior_t = clamp(
        (1.0 - uniforms.magnitude_weight) * activity_t +
            uniforms.magnitude_weight * magnitude_t,
        0.0,
        1.0
    );

    let seam = clamp(fwidth(data.a) * uniforms.seam_strength, 0.0, 1.0);
    var color = escape_palette(escape_t);
    if (uniforms.mode == 1u) {
        return vec4f(color, 1.0);
    }
    if (uniforms.mode == 2u) {
        return vec4f(interior_palette(activity_t), 1.0);
    }
    if (uniforms.mode == 3u) {
        return vec4f(interior_palette(magnitude_t), 1.0);
    }

    if (!escaped) {
        color = interior_palette(interior_t);
    } else {
        color = mix(color, uniforms.escape_4, seam);
    }
    return vec4f(color, 1.0);
}
