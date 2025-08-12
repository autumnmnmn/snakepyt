
@group(0) @binding(0) var output_texture: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(16, 16)
fn comp(@builtin(global_invocation_id) id: vec3<u32>) {
    let px = id.x;
    let py = id.y;

    let coord = vec2<i32>(i32(id.x), i32(id.y));
    let checker_x = (id.x) % 16u;
    let checker_y = (id.y) % 16u;
    var color = select(vec4<f32>(1.0, 0.0, 0.0, 1.0), vec4<f32>(0.0, 0.0, 1.0, 1.0), (checker_x < 8u) != (checker_y < 8u));

    color.g = f32(px * py) / 99999.0 % 1.0;

    textureStore(output_texture, coord, color);
}

